import { Server } from '../../servers/server.model';
import { renderString } from '../../../string.util';
import * as fs from 'fs';
import * as path from 'path';
import * as config from '../../../../config.json';

const APP_LABEL = config.label;

export interface GameArgsOptions {
  /**
   * Server port to bind
   */
  port?: number

  /**
   * Server name to use
   * Default: Valheim
   */
  servername?: string

  /**
   * Server password to use
   * Leave blank for none
   * Minimum 5 chars
   */
  password?: string

  /**
   * World name to start the server with
   * Default: dedicated
   */
  world?: string
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

export class ValheimChart {
  static renderDeployment(options: BookingOptions): string {
    const args = this.getArgs(options);
    const app = "valheim"
    return renderString(fs.readFileSync(path.resolve(__dirname + '/../../../../assets/deployment.yaml')).toString(), {
      label: APP_LABEL,
      app,
      id: options.id,
      image: options.image,
      hostname: options.hostname,
      args
    });
  }

  static getArgs(options: GameArgsOptions): string {
    let args = "";
    args += ` -name "${options.servername || "Valheim"}"`;
    args += ` -world "${options.world || "Dedicated"}"`;
    args += ` -port ${options.port || "2456"}`;
    args += ` -public 1`;

    if (options.password)
      args += ` -password "${options.password}"`;

    return args;
  }

  static getDataObject(
    server: Server,
    {
      port = 27815,
      image = "",
      hostname = "Valheim"
    }
  ): BookingOptions {
    return {
      ...server.toJSON(),
      id: server._id,
      port, image, hostname
    }
  }
}