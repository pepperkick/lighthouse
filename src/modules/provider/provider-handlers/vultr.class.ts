import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as Vultr from "@vultr/vultr-node";
import { renderString } from "src/string.util";
import * as sleep from "await-sleep";
import { query } from "gamedig";
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import { Game as GameEnum } from '../../../objects/game.enum';
import { VULTR_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { VULTR_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';

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

		const script = renderString(STARTUP_SCRIPT, {
			id: data.id,
			image: data.image,
			args
		});
		this.logger.debug(`Script: ${script}`)
		
		try {
			const script_info = await this.api.startupScript.create({
				name: `script-${data.id}`,
				script
			});
			const script_id = script_info.SCRIPTID;

			if (!script_info.SCRIPTID) {
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
					throw new Error("Failed to start server");
				}
			}		
			
			const info = await this.api.server.list({
				SUBID: parseInt(server.SUBID)
			});

			data.ip = info.main_ip;
			options.ip = info.main_ip;
			await options.save();

			let query_options;
			if (options.game === GameEnum.TF2_COMP) {
				query_options = {
					host: data.ip,
					port: data.port,
					type: "tf2"
				}
			} else if (options.game === GameEnum.VALHEIM) {
				query_options = {
					host: data.ip,
					port: data.port,
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					type: "valheim"
				}
			}

			let server_query;
			retry = 0;
			while (server_query === undefined) {
				try {
					server_query = await query(query_options);
				}	catch (error) {
					this.logger.debug(`No response from ${options.game} server ${data.id} (${data.ip}:${data.port})`);
				}

				await sleep(10000);
				if (retry++ === 60) {
					throw new Error("Timeout waiting for the game instance");
				}
			}

			return options;
		} catch (error) {
			await this.destroyInstance(options);
			this.logger.error(`Failed to create vultr instance`, error);
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