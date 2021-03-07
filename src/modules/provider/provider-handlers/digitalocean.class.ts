import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json";
import * as sleep from "await-sleep";
import { ServerChart } from "src/modules/servers/server.chart";
import { renderString } from "src/string.util";
import { createApiClient } from 'dots-wrapper';
import { query } from "gamedig";
import { Server } from '../../servers/server.model';
import { Game } from '../../games/game.model';

const STARTUP_SCRIPT = 
`#!/bin/bash

ufw allow 27015/udp
ufw allow 27015/tcp
ufw allow 27020/udp
ufw allow 27020/tcp

IP=$(curl -s https://icanhazip.com)
docker run -d --network host {{ image }} {{ args }} +ip "$IP"`

export class DigitalOceanHandler extends Handler {
	constructor(provider: Provider, game: Game) {
		super(provider);

		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.digital_ocean };
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
					options.ip = ip;
					await options.save();
					break;
				}

				await sleep(2000);
				if (retry++ === 150) {
					await this.destroyInstance(options);
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

				await sleep(10000);
				if (retry++ === 60) {
					await this.destroyInstance(options);
					throw new Error("Timeout waiting for the game instance");
				}
			}

			return options;
		} catch (error) {
			this.logger.error("Failed to create digital ocean instance", error);
			throw error;
		}
	}

	async destroyInstance(server: Server): Promise<void> {
		try {	
			const client = createApiClient({
				token: this.provider.metadata.digitalOceanToken
			});
			await client.droplet.deleteDropletsByTag({
				tag_name: `lighthouse-${server.id}`
			});
		} catch (error) {
			this.logger.error("Failed to delete digital ocean instance", error);
			throw error;
		}
	}
}