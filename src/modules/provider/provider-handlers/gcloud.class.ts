import * as Compute from "@google-cloud/compute";

import { Handler, InstanceOptions } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json"
import { writeFileSync } from "fs";
import { BookingChart, BookingOptions } from "src/modules/booking/booking.chart";
import { BookingService } from "src/modules/booking/booking.service";

export class GCloudHandler extends Handler {
	compute: any
	zone: any
	region: any

	constructor(
		provider: Provider,
		bookingService: BookingService
	) {
		super(provider, bookingService);

		const config = JSON.parse(provider.metadata.gcloudconfig);
		const project = config.project_id;
		
		writeFileSync(`./gcloud-${provider.id}-${project}.key.json`, JSON.stringify(config));

		this.compute = new Compute({
			projectId: project, 
			keyFilename: `./gcloud-${provider.id}-${project}.key.json`
		});
		this.zone = this.compute.zone(provider.metadata.zone);
		this.region = this.compute.region(provider.metadata.region);
	}	

	async createInstance(options: InstanceOptions) {
		const address = this.region.address(`tf2-${options.id}`);
		let ip;

		try {
			const address_data = await address.create();
			await address_data[1].promise();
			ip = (await address_data[0].getMetadata())[0].address;
		} catch (error) {
			if (error.code === 409 && error.errors.filter(e => e.reason === "alreadyExists").length > 0) {
				this.logger.warn("Failed to create address as it already exists, reusing it.");
				const address_data = await address.get();
				ip = (await address_data[0].getMetadata())[0].address;
			} else {
				this.logger.error("Failed to create address", error);	
				throw error;
			}
		}

		this.logger.debug(`Got GCloud IP ${ip} for booking ${options.id}`);
		
		const data = {
			id: options.id,
			token: options.token, 
			image: options.image || this.provider.metadata.image,
			servername: options.servername || config.instance.hostname,
			ip: null, port: 27015, 
			password: options.password, 
			rconPassword: options.rconPassword, 
			tv: { port: 27020, name: config.instance.tv_name },
			provider: { 
				id: this.provider.id,
				autoClose: this.provider.metadata.autoClose || { time: 905, min: 1 }
			},
			selectors: this.provider.selectors
		}		


		try {
			const vm_data =  await this.zone.createVM(`tf2-${options.id}`, {
				os: this.provider.metadata.vmImage,
				machineType: this.provider.metadata.machineType,
				networkInterfaces: [ { accessConfigs: {
					type: "ONE_TO_ONE_NAT",
					natIP: ip
				} } ],
				metadata: {
					items: [ { 
						key: "startup-script",
						value: 
							`
							#! /bin/bash

							while : ; do
								if sudo iptables -L INPUT | grep -i "policy accept"; then
									break
								else
									sudo iptables -P INPUT ACCEPT
								fi
							done

							while : ; do
								if sudo iptables -L OUTPUT | grep -i "policy accept"; then
									break
								else
									sudo iptables -P OUTPUT ACCEPT
								fi
							done
	
							docker run --network host ${this.provider.metadata.image} ${BookingChart.getArgs(data)}
							`
					} ]
				}
			});
	
			await vm_data[1].promise();
		} catch (error) {
			this.logger.error("Failed to create VM", error);

			try {
				const address = this.region.address(`tf2-${options.id}`);
				const address_data = await address.delete();
				await address_data[0].promise();
			} catch (error) {
				this.logger.error("Failed to delete address for failed VM", error);				
			}

			throw error;
		}

		data.ip = ip;

		return data;
	}

	async destroyInstance(id: string) {
		const address = this.region.address(`tf2-${id}`);
		const address_data = await address.delete();
		await address_data[0].promise();
		const vm = this.zone.vm(`tf2-${id}`);
		const vm_data = await vm.delete();
		await vm_data[0].promise();
	}
}