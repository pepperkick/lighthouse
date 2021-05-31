import * as fs from "fs";
import * as path from "path";
import * as config from "../../../../config.json"
import { renderString } from "src/string.util";
import { Server } from '../../servers/server.model';

const APP_LABEL = config.label;

export interface GameArgsOptions {
	/**
	 * Server IP to bind
	 */
	ip: string

	/**
	 * Server port to bind
	 */
	port?: number

	/**
	 * Server name to use
	 * Default: Team Fortress
	 */
	servername?: string

	/**
	 * Server password to use
	 * Leave blank for none
	 */
	password?: string

	/**
	 * Rcon password to use
	 * Leave blank for none
	 */
	rconPassword?: string

	/**
	 * Map name to start the server with
	 * Default: cp_badlands
	 */
	map?: string

	/**
	 * SourceTV options
	 */
	tv?: {
		/**
		 * Is TV enabled
		 */
		enabled?: boolean,

		/**
		 * Server port to bind source tv
		 */
		port?: number,

		/**
		 * Name for source tv
		 * Default: SourceTV
		 */
		name?: string
	}
}

export interface BookingOptions extends GameArgsOptions {
	/**
	 * Deployment ID
	 */
	id: string

	/**
	 * Image name to use
	 */
	image: string

	/**
	 * Node hostname to use
	 */
	hostname: string
}

export class Tf2Chart {
	static renderDeployment(options: BookingOptions): string {
		const args = this.getArgs(options);
		const app = "tf2"
		return renderString(
			fs.readFileSync(
				path.resolve(__dirname + '/../../../../assets/deployment.yaml')
			).toString(), {
			label: APP_LABEL,
			app,
			id: options.id,
			image: options.image,
			hostname: options.hostname,
			args
		});
	}

	static getArgs(options: GameArgsOptions): string {
		let args = "./srcds_run +servercfgfile server -condebug";
		args += ` +hostname \\"${options.servername || "Team Fortress"}\\"`;
		args += ` +sv_password \\"${options.password || ""}\\"`;
		args += ` +rcon_password \\"${options.rconPassword || ""}\\"`;
		args += ` +map \\"${options.map || "cp_badlands"}\\"`;			
		args += ` +port ${options.port || "27015"}`;

		if (options.ip)
			args += ` +ip ${options.ip}`;

		if (options.tv.enabled) {
			args += ` +tv_enable 1`;
			args += ` +tv_name \\"${options.tv.name || "SourceTV"}\\"`;
			args += ` +tv_title \\"${options.tv.name || "SourceTV"}\\"`;
			args += ` +tv_port ${options.tv.port || "27020"}`;
		}

		return args;
	}

	static getDataObject(
		server: Server,
		{
			port = 27815,
			image = "",
			tvEnable = false,
			tvPort = 27020,
			tvName = "QixTV",
			hostname = "Qixalite Bookable"
		}
	): BookingOptions {
		const data: BookingOptions = {
			...server.toJSON(),
			id: server._id,
			port: server.port || port,
			image,
			hostname
		}

		if (tvEnable) {
			data.tv = {
				enabled: true,
				port: server.tvPort || tvPort,
				name: tvName
			}
		}

		return data
	}
}