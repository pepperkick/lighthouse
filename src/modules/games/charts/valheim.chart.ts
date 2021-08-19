import { Server } from '../../servers/server.model';
import { renderString } from '../../../string.util';
import * as fs from 'fs';
import * as path from 'path';
import * as config from '../../../../config.json';
import { GameChart } from './common.chart';

const APP_LABEL = config.label;

export class ValheimChart extends GameChart {
  static renderDeployment(server: Server, hostname: string, instanceLabel: string): string {
    const args = this.getArgs(server);
    const app = "valheim"
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

  static getArgs(server: Server): string {
    let args = "bash -c '/root/res/start.sh";
    args += ` -name "${server.data.servername || "Valheim"}"`;
    args += ` -world "${server.data.world || "World"}"`;
    args += ` -port ${server.port || "2456"}`;
    args += ` -public 1`;

    if (server.data.password)
      args += ` -password "${server.data.password}"`;

    return args;
  }
}