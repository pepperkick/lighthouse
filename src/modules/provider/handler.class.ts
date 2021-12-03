import { Provider } from "./provider.model";
import { Logger, NotImplementedException } from '@nestjs/common';
import { Server } from '../servers/server.model';
import { Game as GameEnum } from '../../objects/game.enum';
import { Tf2Chart } from '../games/charts/tf2.chart';
import { ValheimChart } from '../games/charts/valheim.chart';
import { MinecraftChart } from '../games/charts/minecraft.chart';
import { renderString } from '../../string.util';

export interface ProviderGameScripts {
	tf2: string
	minecraft: string
	valheim: string
}

export class Handler {
	readonly logger = new Logger(Handler.name);	

	constructor(
		readonly provider: Provider
	) {
		this.logger.debug(`Created new provider handler with id ${this.provider._id}`);
	}

	createInstance(server: Server): Promise<Server> {
		throw new NotImplementedException()
	}

	destroyInstance(server: Server): Promise<void> {
		throw new NotImplementedException()
	}

	getDefaultOptions(server: Server, scripts: ProviderGameScripts, extraArgs = ""): [Server, string] {
		this.logger.debug(`Server: server(${JSON.stringify(server, null, 2)})`, "getDefaultOptions")

		let args, startupScript

		server.image = server.image || this.provider.metadata.image

		switch (server.game) {
			case GameEnum.TF2:
				server.port = 27015
				args = Tf2Chart.getArgs(server);
				break
			case GameEnum.VALHEIM:
				server.port = 2456
				args = ValheimChart.getArgs(server);
				break
			case GameEnum.MINECRAFT:
				server.port = 25565
				server.data.rconPort = 25575
				args = MinecraftChart.getArgs(server);
				break
		}

		args += extraArgs;

		switch (server.game) {
			case GameEnum.TF2:
				startupScript = scripts.tf2
				break
			case GameEnum.VALHEIM:
				startupScript = scripts.valheim
				break
			case GameEnum.MINECRAFT:
				startupScript = scripts.minecraft
				break
		}

		const argsOptions = {
			id: server.id,
			image: server.image,
			gitRepo: server.data.gitRepository || "",
			gitKey: server.data.gitDeployKey || "",
			args
		}

		const script = renderString(startupScript, argsOptions);

		this.logger.debug(`Script: ${script}`, "getDefaultOptions")

		return [server, script]
	}
}