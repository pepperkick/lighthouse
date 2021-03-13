import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import * as sleep from 'await-sleep';
import { BookingOptions } from 'src/modules/games/charts/common.chart';
import { renderString } from 'src/string.util';
import { createApiClient } from 'dots-wrapper';
import { query } from 'gamedig';
import { Server } from '../../servers/server.model';
import { Game } from '../../games/game.model';
import { Game as GameEnum } from '../../../objects/game.enum';
import { DIGITAL_OCEAN_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { DIGITAL_OCEAN_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';

export class DigitalOceanHandler extends Handler {
	constructor(provider: Provider, game: Game) {
		super(provider);

		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.digital_ocean };
	}
	
	async createInstance(options: Server): Promise<Server> {
		let STARTUP_SCRIPT = "", data, args;

		switch (options.game) {
			case GameEnum.TF2_COMP:
				options.port = 27015
				options.tvPort = 27020
				data = Tf2Chart.getDataObject(options, {
					port: options.port,
					tvEnable: true,
					tvPort: options.tvPort,
					image: this.provider.metadata.image
				}) as Tf2Options
				args = Tf2Chart.getArgs(data);
				break
			case GameEnum.VALHEIM:
				options.port = 2456
				data = ValheimChart.getDataObject(options, {
					port: options.port,
					image: this.provider.metadata.image
				}) as ValheimOptions
				args = ValheimChart.getArgs(data);
				break
		}

		switch (options.game) {
			case GameEnum.TF2_COMP:
				STARTUP_SCRIPT = TF2_STARTUP_SCRIPT
				break
			case GameEnum.VALHEIM:
				STARTUP_SCRIPT = VALHEIM_STARTUP_SCRIPT
				break
		}

		const args_options = {
			id: data.id,
			image: data.image,
			git_repo: undefined,
			git_key: undefined,
			args
		}

		if (options.data?.git_repository) {
			args_options.git_repo = options.data.git_repository
			args_options.git_key = options.data.git_deploy_key
		}

		const script = renderString(STARTUP_SCRIPT, args_options);
		
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

			if (options.game === GameEnum.TF2_COMP) {
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
						this.logger.debug(`No response from tf2-comp server ${data.id} (${data.ip}:${data.port}) (${retry} / 60)`);
					}

					await sleep(10000);
					if (retry++ === 60) {
						await this.destroyInstance(options);
						throw new Error("Timeout waiting for the game instance");
					}
				}
			} else if (options.game === GameEnum.VALHEIM) {
				let server_query;
				retry = 0;
				while (server_query === undefined) {
					try {
						server_query = await query({
							host: data.ip,
							port: data.port,
							// eslint-disable-next-line @typescript-eslint/ban-ts-comment
							// @ts-ignore
							type: "valheim"
						});
					}	catch (error) {
						this.logger.debug(`No response from valheim server ${data.id} (${data.ip}:${data.port}) (${retry} / 60)`);
					}

					await sleep(10000);
					if (retry++ === 60) {
						await this.destroyInstance(options);
						throw new Error("Timeout waiting for the game instance");
					}
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