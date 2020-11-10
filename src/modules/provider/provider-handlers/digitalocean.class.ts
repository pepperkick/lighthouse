
import { BookingService } from "src/modules/booking/booking.service";
import { Handler, InstanceOptions } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json";
import * as sleep from "await-sleep";
import { BookingChart } from "src/modules/booking/booking.chart";
import { renderString } from "src/string.util";
import { createApiClient } from 'dots-wrapper';
import { query } from "gamedig";

const STARTUP_SCRIPT = 
`#!/bin/bash

ufw allow 27015/udp
ufw allow 27015/tcp
ufw allow 27020/udp
ufw allow 27020/tcp

IP=$(curl -s https://icanhazip.com)
docker run -d --network host {{ image }} {{ args }} +ip "$IP"`

export class DigitalOceanHandler extends Handler {
	constructor(
		provider: Provider,
		bookingService: BookingService
	) {		
		super(provider, bookingService);
	}
	
	async createInstance(options: InstanceOptions) {
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

		const args = BookingChart.getArgs(data);
		const script = renderString(STARTUP_SCRIPT, {
			id: options.id,
			image: options.image || this.provider.metadata.image,
			args
		});
		
		try {
			const metadata = this.provider.metadata;		
			const client = createApiClient({
				token: this.provider.metadata.digitalOceanToken
			});
			const { data: { droplet } } = await client.droplet.createDroplet({
				name: `lighthouse-${data.id}`,
				region: metadata.digitalOceanRegion,
				size: metadata.digitalOceanMachineType,
				image: metadata.digitalOceanMachineImage,
				tags: [ `lighthouse`, `lighthouse-${data.id}` ],
				user_data: script,
				ssh_keys: [ metadata.digitalOceanSSHKeyId ]
			});

			let retry = 0;
			while (true) {		
				const query = await client.droplet.getDroplet({ droplet_id: droplet.id });
				const ip = query?.data?.droplet?.networks?.v4.filter(ele => ele.type === "public")[0]?.ip_address;
				if (ip) {
					this.logger.debug(`Assigned Digital Ocean IP ${ip}`);
					data.ip = ip
					break;
				}

				await sleep(2000);
				if (retry++ === 500) {
					this.destroyInstance(data.id);
					throw new Error("Timeout waiting for the droplet instance");
				}
			}

			let server_query;
			retry = 0;
			while (server_query === undefined) {		
				try {
					server_query = await query({
						host: data.ip, 
						port: data.port,
						type: "tf2"
					});
				}	catch (error) {
					this.logger.debug(`No response from server ${data.id} (${data.ip}:${data.port})`);
				}

				await sleep(2000);
				if (retry++ === 500) {
					this.destroyInstance(data.id);
					throw new Error("Timeout waiting for the game instance");
				}
			}

			return data;
		} catch (error) {
			this.logger.error("Failed to create digital ocean instance", error);
			throw error;
		}
	}

	async destroyInstance(id: string) {
		try {	
			const client = createApiClient({
				token: this.provider.metadata.digitalOceanToken
			});
			await client.droplet.deleteDropletsByTag({
				tag_name: `lighthouse-${id}`
			});
		} catch (error) {
			this.logger.error("Failed to delete digital ocean instance", error);
			throw error;
		}
	}
}