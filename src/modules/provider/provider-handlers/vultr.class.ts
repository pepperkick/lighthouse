import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as Vultr from "@vultr/vultr-node";
import * as config from "../../../../config.json"
import { renderString } from "src/string.util";
import { ServerChart } from "src/modules/servers/server.chart";
import * as sleep from "await-sleep";
import { query } from "gamedig";
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';

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

	constructor(provider: Provider, game: Game) {
		super(provider);

		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.vultr };
		
		this.api = Vultr.initialize({
			apiKey: provider.metadata.vultrApiKey
		});
	}

	async createInstance(options: Server): Promise<Server> {
		options.port = 27015;
		options.tvPort = 27020;

		const data = {
			...options.toJSON(),
			id: options._id,
			image: this.provider.metadata.image,
			tv: { enabled: true, port: 27020, name: config.instance.tv_name }
		}

		const args = ServerChart.getArgs(data);
		const script = renderString(STARTUP_SCRIPT, {
			id: data.id,
			image: data.image,
			args
		});
		
		try {
			const script_info = await this.api.startupScript.create({
				name: `script-${data.id}`,
				script
			});
			const script_id = script_info.SCRIPTID;

			if (!script_info.SCRIPTID) {
				await this.destroyInstance(options);
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
				await this.destroyInstance(options);
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

				if (retry++ === 60) {
					await this.destroyInstance(options);
					throw new Error("Failed to start server");
				}
			}		
			
			const info = await this.api.server.list({
				SUBID: parseInt(server.SUBID)
			});

			data.ip = info.main_ip;
			options.ip = info.main_ip;
			await options.save();

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

				await sleep(10000);
				if (retry++ === 60) {
					await this.destroyInstance(options);
					throw new Error("Timeout waiting for the game instance");
				}
			}

			return options;
		} catch (error) {
			await this.destroyInstance(options);
			this.logger.error("Failed to create server", error);
			throw error;
		}
	}

	async destroyInstance(server: Server): Promise<void> {
		const scripts = await this.api.startupScript.list();
		
		for (const sid in scripts) {
			const item = scripts[sid];
			if (item.name === `script-${server.id}`) {
				await this.api.startupScript.delete({
					SCRIPTID: item.SCRIPTID
				});
			}
		}

		const servers = await this.api.server.list();
		
		for (const sid in servers) {
			const item = servers[sid];
			if (item.label === `tf2-${server.id}`) {
				await this.api.server.delete({
					SUBID: parseInt(item.SUBID)
				});
			}
		}
	}
}