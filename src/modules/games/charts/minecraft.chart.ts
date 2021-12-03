import * as fs from "fs";
import * as path from "path";
import * as config from "../../../../config.json"
import { renderString } from "src/string.util";
import { Server } from '../../servers/server.model';
import { GameChart } from './common.chart';

const APP_LABEL = config.label;

export class MinecraftChart extends GameChart {
  static renderDeployment(server: Server, hostname: string, instanceLabel: string): string {
    const args = this.getArgs(server);
    const app = "minecraft"
    const file = '/../../../../assets/deployment.yaml'
    const contents = fs.readFileSync(path.resolve(__dirname + file)).toString()
    return renderString(contents, {
      label: APP_LABEL,
      app,
      instanceLabel,
      id: server.id,
      image: server.image,
      gitRepo: server.data.gitRepository,
      gitKey: server.data.gitDeployKey,
      hostname,
      args
    });
  }

  static getArgs(options: Server): string {
    let args = "bash -c '/root/res/start.sh";
    args += ` --port ${options.port || "25565"}`;
    args += ` --rcon-port ${options.data.rconPort || "25575"}`;
    return args;
  }
}