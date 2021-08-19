import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as sleep from "await-sleep";
import axios from 'axios';
import { writeFileSync } from 'fs';
import { BINARYLANE_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { BINARYLANE_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { BINARYLANE_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import * as config from '../../../../config.json';

const label = config.instance.label

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SSH = require("ssh2-promise")
const API_URL = "https://api.binarylane.com.au/v2"

export class BinaryLaneHandler extends Handler {
  api_token: string

  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.binarylane };

    this.api_token = provider.metadata.binarylaneApiKey
  }

  async createInstance(server: Server): Promise<Server> {
    const [_server, script] = this.getDefaultOptions(server, {
      tf2: TF2_STARTUP_SCRIPT,
      minecraft: MINECRAFT_STARTUP_SCRIPT,
      valheim: VALHEIM_STARTUP_SCRIPT
    })
    server = _server

    try {
      // Create the server
      const body = {
        "name": `${server._id}.${label}.lighthouse.com`,
        "backups": false,
        "size": this.provider.metadata.binarylaneMachineSize,
        "image": parseInt(this.provider.metadata.binarylaneMachineImage),
        "region": this.provider.metadata.binarylaneRegion
      }
      this.logger.debug(`Request body: ${JSON.stringify(body, null, 2)}`)
      const response = await axios.post(`${API_URL}/servers`, body, {
        headers: {
          "Authorization": `Bearer ${this.api_token}`
        }
      });
      const data = response.data;
      const serverId = data.server.id;
      const serverIp = data.server.networks.v4[0].ip_address

      this.logger.debug(`Assigned Binarylane IP ${serverIp}`);
      server.ip = serverIp;

      if (!serverId) {
        throw new Error("Failed to create the server instance")
      }

      // Wait for status to be ready
      let retry = 0;
      while (true) {
        const res = await axios.get(`${API_URL}/servers/${serverId}`, {
          headers: {
            "Authorization": `Bearer ${this.api_token}`
          }
        });
        const data = res.data

        this.logger.debug(`Response: ${JSON.stringify(data, null, 2)}`, "waitingForServer")
        this.logger.debug(`Status: ${JSON.stringify(data.server.status, null, 2)}`, "waitingForServer")
        if (data.server.status === "active") {
          break;
        }

        await sleep(5000);
        this.logger.debug(`Retry: ( ${retry} / 120 )`, "waitingForServer")

        if (retry++ === 120) {
          throw new Error("Failed to allocate server");
        }
      }

      // Restore the game backup to the new instance
      const imageServer = await this.getServerIdByName(this.provider.metadata.binarylaneImageInstance)
      const backupId = imageServer.backup_ids[0]
      const action = await this.cloneBackupToServer(imageServer.id, serverId, backupId)
      if (!await this.waitForActionToComplete(action.id, 600)) {
        throw new Error("Timeout waiting for the backup restoring to complete");
      }

      // Write key
      const sshKey = this.provider.metadata.binarylaneSSHKey;
      writeFileSync(`./binarylane-${server.id}.key`, sshKey);

      // Connect via ssh
      const sshconfig = {
        host: serverIp,
        username: "root",
        identity: `./binarylane-${server.id}.key`
      }
      this.logger.log("Connecting to server via SSH...");
      const ssh = new SSH(sshconfig);
      await ssh.connect()
      this.logger.log("Sending startup command...");
      await ssh.exec(script);
      await ssh.close()
      this.logger.log("SSH connection closed");

      return server
    } catch (error) {
      this.logger.error(`Failed to create binarylane instance`, error);
      await this.destroyInstance(server);
      throw error;
    }
  }

  async destroyInstance(server: Server): Promise<void> {
    this.logger.debug(`Options: server(${server})`, "destroyInstance")

    // Find the server
    const targetServer = await this.getServerIdByName(`${server._id}.${label}.lighthouse.com`)

    if (!targetServer) {
      this.logger.log("Target server not found")
      return
    }

    // Delete the server
    try {
      await axios.delete(`${API_URL}/servers/${targetServer.id}`, {
        headers: {
          "Authorization": `Bearer ${this.api_token}`
        }
      });
    } catch (error) {
      this.logger.error(`Failed to destroy binarylane instance` , error);
      throw error;
    }
  }

  async getServerIdByName(name: string): Promise<any> {
    this.logger.debug(`Options: name(${name})`, "getServerIdByName")

    const res = await axios.get(`${API_URL}/servers`, {
      headers: {
        "Authorization": `Bearer ${this.api_token}`
      }
    })
    const data = res.data
    this.logger.debug(`Response: ${JSON.stringify(data, null, 2)}`, "getServerIdByName")

    for (const server of data.servers) {
      if (server.name === name) {
        return server
      }
    }

    return false
  }

  async cloneBackupToServer(serverId: number, targetId: number, backupId: number): Promise<any> {
    this.logger.debug(`Options: serverId(${serverId}) targetId(${targetId}) backupId(${backupId})`, "cloneBackupToServer")
    const response = await axios.post(`${API_URL}/servers/${serverId}/actions`, {
      "type": "clone_using_backup",
      "target_server_id": targetId,
      "image_id": backupId
    }, {
      headers: {
        "Authorization": `Bearer ${this.api_token}`
      }
    });

    this.logger.debug(`Response: ${JSON.stringify(response.data, null, 2)}`, "cloneBackupToServer")
    return response.data.action;
  }

  async waitForActionToComplete(actionId: number, retry: number): Promise<any> {
    this.logger.debug(`Options: actionId(${actionId}) retry(${retry})`, "waitForActionToComplete")

    while (retry-- > 0) {
      const response = await axios.get(`${API_URL}/actions/${actionId}`, {
        headers: {
          "Authorization": `Bearer ${this.api_token}`
        }
      });

      this.logger.debug(`Response: ${JSON.stringify(response.data, null, 2)}`, "waitForActionToComplete")
      const action = response.data.action;

      if (action.status === "completed")
        return true;

      await sleep(1000);
    }

    return false;
  }
}