import { Handler, InstanceOptions } from "../handler.class";
import { BookingService } from "src/modules/booking/booking.service";
import { Provider } from "../provider.model";
import * as Vultr from "@vultr/vultr-node";
import * as config from "../../../../config.json"
import { renderString } from "src/string.util";
import { BookingChart } from "src/modules/booking/booking.chart";
import * as sleep from "await-sleep";
import { query } from "gamedig";

const STARTUP_SCRIPT = 
`#!/bin/bash

ufw allow 27015/udp
ufw allow 27015/tcp
ufw allow 27020/udp
ufw allow 27020/tcp

IP=$(curl -s https://icanhazip.com)
docker run -d --network host {{ image }} {{ args }} +ip "$IP"`

export class VultrHandler extends Handler {
	api: any;

	constructor(
		provider: Provider,
		bookingService: BookingService
	) {		
		super(provider, bookingService);
		
		this.api = Vultr.initialize({
			apiKey: provider.metadata.vultrApiKey
		});
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
			const script_info = await this.api.startupScript.create({
				name: `script-${data.id}`,
				script
			});
			const script_id = script_info.SCRIPTID;

			if (!script_info.SCRIPTID) {
				this.destroyInstance(data.id);
				throw new Error("Failed to create script");
			}

			const server = await this.api.server.create({
				SCRIPTID: script_id,
				APPID: 37,
				OSID: 186,
				VPSPLANID: this.provider.metadata.vultrPlanId,
				DCID: this.provider.metadata.vultrLocationId, 
				label: `tf2-${data.id}`,
				notify_activate: 'no'
			});

			if (!server.SUBID) {
				this.destroyInstance(data.id);
				throw new Error("Failed to start server");
			}

			let server_info;
			let retry = 0;
			while (!(server_info?.status === "active" && server_info?.power_status === "running" && server_info?.server_state === "installingbooting")) {
				const info = await this.api.server.list({
					SUBID: parseInt(server.SUBID)
				});
				server_info = info
				this.logger.debug(`Server status ${info.status} ${info.power_status} ${info.server_state}`);	
				await sleep(5000);

				if (retry++ === 200) {
					this.destroyInstance(data.id);
					throw new Error("Failed to start server");
				}
			}		
			
			const info = await this.api.server.list({
				SUBID: parseInt(server.SUBID)
			});

			data.ip = info.main_ip;

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
			this.destroyInstance(data.id);
			this.logger.error("Failed to create server", error);
			throw error;
		}
	}

	async destroyInstance(id: string) {
		const scripts = await this.api.startupScript.list();
		
		for (let sid in scripts) {
			const item = scripts[sid];
			if (item.name === `script-${id}`) {
				await this.api.startupScript.delete({
					SCRIPTID: item.SCRIPTID
				});
			}
		}

		const servers = await this.api.server.list();
		
		for (let sid in servers) {
			const item = servers[sid];
			if (item.label === `tf2-${id}`) {
				await this.api.server.delete({
					SUBID: parseInt(item.SUBID)
				});
			}
		}
	}
}