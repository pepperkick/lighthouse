import * as fs from "fs";
import * as path from "path";
import * as config from "../../../../config.json"
import { renderString } from "src/string.util";
import { Server } from '../../servers/server.model';

const APP_LABEL = config.label;

export interface GameArgsOptions {
  /**
   * Server port to bind
   */
  port?: number

  /**
   * Server rcon port to bind
   */
  rconPort?: number
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

export class MinecraftChart {
  static renderDeployment(options: BookingOptions): string {
    const args = this.getArgs(options);
    const app = "minecraft"
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
    args += ` --port ${options.port || "25565"}`;
    args += ` --rcon-port ${options.rconPort || "25575"}`;
    return args;
  }

  static getDataObject(
    server: Server,
    {
      port = 25565,
      rconPort = 26675,
      image = "",
      hostname = "minecraft"
    }
  ): BookingOptions {
    return {
      ...server.toJSON(),
      id: server._id,
      port, image, hostname, rconPort
    }
  }
}