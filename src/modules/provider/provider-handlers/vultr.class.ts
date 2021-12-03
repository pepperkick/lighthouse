import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as Vultr from "@vultr/vultr-node";
import * as sleep from "await-sleep";
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import { VULTR_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { VULTR_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { VULTR_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import * as config from '../../../../config.json';

const label = config.instance.label

export class VultrHandler extends Handler {
	api: any;

	constructor(provider: Provider, game: Game) {
		super(provider);

		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.vultr };
		
		this.api = Vultr.initialize({
			apiKey: provider.metadata.vultrApiKey
		});
	}

	async createInstance(server: Server): Promise<Server> {
		const [_server, script] = this.getDefaultOptions(server, {
			tf2: TF2_STARTUP_SCRIPT,
			minecraft: MINECRAFT_STARTUP_SCRIPT,
			valheim: VALHEIM_STARTUP_SCRIPT
		})
		server = _server
		
		try {
			const script_info = await this.api.startupScript.create({
				name: `script-${server.id}`,
				script
			});
			const script_id = script_info.SCRIPTID;

			if (!script_info.SCRIPTID) {
				throw new Error("Failed to create script");
			}

			const instance = await this.api.server.create({
				SCRIPTID: script_id,
				APPID: 37,
				OSID: 186,
				VPSPLANID: this.provider.metadata.vultrPlanId,
				DCID: this.provider.metadata.vultrLocationId, 
				label: `${label}-${server.id}`,
				notify_activate: 'no'
			});

			if (!instance.SUBID) {
				throw new Error("Failed to start server");
			}

			let server_info;
			let retry = 0;
			while (!(server_info?.status === "active" && server_info?.power_status === "running" && server_info?.server_state === "installingbooting")) {
				const info = await this.api.server.list({
					SUBID: parseInt(instance.SUBID)
				});
				server_info = info
				this.logger.debug(`Server status ${info.status} ${info.power_status} ${info.server_state}`);	
				await sleep(5000);

				if (retry++ === 60) {
					throw new Error("Failed to start server");
				}
			}		
			
			const info = await this.api.server.list({
				SUBID: parseInt(instance.SUBID)
			});

			server.ip = info.main_ip;
			await server.save();

			return server;
		} catch (error) {
			await this.destroyInstance(server);
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
			if (item.label === `${label}-${server.id}`) {
				await this.api.server.delete({
					SUBID: parseInt(item.SUBID)
				});
			}
		}
	}
}