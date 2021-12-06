import * as fs from "fs";
import * as path from "path";
import * as config from "../../../../config.json"
import { renderString } from "src/string.util";
import { Server } from '../../servers/server.model';
import { GameChart } from './common.chart';
import * as crypto from 'crypto';

const APP_LABEL = config.label;

export class Tf2Chart extends GameChart {
	static renderDeployment(server: Server, hostname: string, instanceLabel: string): string {
		const args = Tf2Chart.getArgs(server);
		const app = "tf2"
		const file = '/../../../../assets/deployment.yaml'
		const contents = fs.readFileSync(path.resolve(__dirname + file)).toString()
		return renderString(contents, {
			label: APP_LABEL,
			app,
			instanceLabel,
			id: server.id,
			image: server.image,
			gitRepo: server.data.gitRepository || "",
			gitKey: server.data.gitDeployKey || "",
			hostname,
			args
		});
	}

	static getArgs(server: Server): string {
		let name = `${server.data.servername || "Team Fortress"}`
		name = name.split('"').join("")

		let args = "./start.sh"
		args += ` --hatch-address '${server.data.hatchAddress}' --hatch-password '${server.data.hatchPassword}'`
		args += ` +servercfgfile server -condebug`;
		args += ` +hostname '${name}'`;
		args += ` +sv_password '${server.data.password || ""}'`;
		args += ` +rcon_password '${server.data.rconPassword || ""}'`;
		args += ` +map '${server.data.map || "cp_badlands"}'`;
		args += ` +port ${server.port || "27015"}`;

		if (server.ip)
			args += ` +ip ${server.ip}`;

		if (server.data.tvEnable) {
			args += ` +tv_enable 1`;
			args += ` +tv_name '${server.data.tvName || "SourceTV"}'`;
			args += ` +tv_title '${server.data.tvName || "SourceTV"}'`;
			args += ` +tv_port ${server.data.tvPort|| "27020"}`;
			args += ` +tv_password '${server.data.tvPassword || ""}'`;
		}

		if (server.data.sdrEnable) {
			args += ` --enablefakeip`
		}

		return args;
	}

	static populate(server: Server, options: Server): Server {
		server.data = {
			...server.data,
			servername: options.data?.servername || config.instance.hostname || "Lighthouse Bookable",
			password: options.data?.password || "",
			rconPassword: options.data?.rconPassword || "",
			sdrEnable: options.data?.sdrEnable,
			tvPassword: options.data?.tvPassword || "",
			tvPort: 27020,
			tvEnable: true,
			tvName: options.data?.tvName || config.instance.tvName || "LighthouseTV",
			map: options.data?.map || "cp_badlands",
			hatchAddress: options.data?.hatchAddress || ":27017",
			hatchElasticURL: config.hatch.elasticUrl,
			hatchElasticChatIndex: config.hatch.elasticChatIndex,
			hatchElasticLogsIndex: config.hatch.elasticLogsIndex
		}

		if (server.data.password === "*")
			server.data.password = crypto.randomBytes(4).toString("hex");

		if (server.data.rconPassword === "*")
			server.data.rconPassword = crypto.randomBytes(4).toString("hex");

		if (server.data.tvPassword === "*")
			server.data.tvPassword = crypto.randomBytes(4).toString("hex");

		server.data.hatchPassword = options.data?.hatchPassword || server.data.rconPassword

		return server
	}
}