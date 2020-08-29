import * as fs from "fs";

import * as config from "../../../config.json"

const APP_LABEL = config.label;

export interface BookingOptions {
	/**
	 * Deployment ID
	 */
	id: string

	/**
	 * Image name to use
	 */
	image?: string

	/**
	 * GSLT Token
	 */
	token: string

	/**
	 * Server IP to bind
	 */
	ip?: string

	/**
	 * Server port to bind
	 */
	port?: number

	/**
	 * Node hostname to use
	 */
	hostname?: string

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
	 * Leave blank to not deploy source tv
	 */
	tv?: {
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

export class BookingChart {
	static render(options: BookingOptions) {
		const args = this.getArgs(options);
		const app = "tf2"
		return this.renderString(fs.readFileSync(__dirname + '/../../../assets/deployment.yaml').toString(), {
			label: APP_LABEL,
			id: options.id,
			image: options.image,
			hostname: options.hostname,
			args: args       
		});
	}

	static getArgs(options: BookingOptions) {		
		let args = "./srcds_run +servercfgfile server -condebug";
		args += ` +sv_setsteamaccount \\"${options.token}\\"`;
		args += ` +hostname \\"${options.servername || "Team Fortress"}\\"`;
		args += ` +sv_password \\"${options.password || ""}\\"`;
		args += ` +rcon_password \\"${options.rconPassword || ""}\\"`;
		args += ` +map \\"${options.map || "cp_badlands"}\\"`;			
		args += ` +port ${options.port || "27015"}`;

		if (options.ip)
			args += ` +ip ${options.ip}`;

		if (options.tv) {
			args += ` +tv_enable 1`;
			args += ` +tv_name \\"${options.tv.name || "SourceTV"}\\"`;
			args += ` +tv_title \\"${options.tv.name || "SourceTV"}\\"`;
			args += ` +tv_port ${options.tv.port || "27020"}`;
		}

		return args;
	}

	/**
	 * Render a string by filling templates with values
	 * 
	 * Example: 
	 *  params
	 *   str: tf2-{{ name }}
	 *   data: { "name": "test" }
	 *  return
	 *   tf2-test
	 * 
	 * @param str String to do rendering in
	 * @param data Data to use while rendering
	 */
	static renderString(str: string, data = {}) {
		for (let key in data) {
			if (data.hasOwnProperty(key)) {
				str = str.replace(new RegExp(`{{ ${key} }}`, "g"), data[key]);
			}
		}

		return str;
	}
}