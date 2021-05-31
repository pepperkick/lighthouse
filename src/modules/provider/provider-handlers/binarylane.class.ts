import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as sleep from "await-sleep";
import axios from 'axios';
import { Game as GameEnum } from '../../../objects/game.enum';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';
import { BINARYLANE_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { BINARYLANE_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { renderString } from '../../../string.util';
import { writeFileSync } from 'fs';

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

  async createInstance(options: Server): Promise<Server> {
    this.logger.debug(`Options: options(${JSON.stringify(options)})`, "createInstance")
    let STARTUP_SCRIPT = "", data, args;

    switch (options.game) {
      case GameEnum.TF2_COMP:
        options.port = 27015
        options.tvPort = 27020
        data = Tf2Chart.getDataObject(options, {
          port: options.port,
          tvEnable: true,
          tvPort: options.tvPort,
          image: this.provider.metadata.image
        }) as Tf2Options
        args = Tf2Chart.getArgs(data);
        break
      case GameEnum.VALHEIM:
        options.port = 2456
        data = ValheimChart.getDataObject(options, {
          port: options.port,
          image: this.provider.metadata.image
        }) as ValheimOptions
        args = ValheimChart.getArgs(data);
        break
    }

    switch (options.game) {
      case GameEnum.TF2_COMP:
        STARTUP_SCRIPT = TF2_STARTUP_SCRIPT
        break
      case GameEnum.VALHEIM:
        STARTUP_SCRIPT = VALHEIM_STARTUP_SCRIPT
        break
    }

    const args_options = {
      id: data.id,
      image: data.image,
      git_repo: undefined,
      git_key: undefined,
      args
    }

    if (options.data?.git_repository) {
      args_options.git_repo = options.data.git_repository
      args_options.git_key = options.data.git_deploy_key
    }

    const script = renderString(STARTUP_SCRIPT, args_options);
    this.logger.debug(`Script: ${script}`)

    try {
      // Create the server
      const body = {
        "name": `${options._id}.lighthouse.qixalite.com`,
        "backups": false,
        "size": this.provider.metadata.binarylaneMachineSize,
        "image": parseInt(this.provider.metadata.binarylaneMachineImage),
        "region": this.provider.metadata.binarylaneRegion
      }
      this.logger.debug(`Request body: ${JSON.stringify(body)}`)
      const response = await axios.post(`${API_URL}/servers`, body, {
        headers: {
          "Authorization": `Bearer ${this.api_token}`
        }
      });
      const data = response.data;
      const serverId = data.server.id;
      const serverIp = data.server.networks.v4[0].ip_address

      this.logger.debug(`Assigned Binarylane IP ${serverIp}`);
      data.ip = serverIp
      options.ip = serverIp;

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

        this.logger.debug(`Response: ${JSON.stringify(data)}`, "waitingForServer")
        this.logger.debug(`Status: ${JSON.stringify(data.server.status)}`, "waitingForServer")
        if (data.server.status === "active") {
          break;
        }

        retry++;
        await sleep(2000);

        if (retry === 120) {
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
      writeFileSync(`./binarylane-${options.id}.key`, sshKey);

      // Connect via ssh
      const sshconfig = {
        host: serverIp,
        username: "root",
        identity: `./binarylane-${options.id}.key`
      }
      this.logger.log("Connecting to server via SSH...");
      const ssh = new SSH(sshconfig);
      await ssh.connect()
      this.logger.log("Sending startup command...");
      await ssh.exec(script);
      await ssh.close()
      this.logger.log("SSH connection closed");

      return options
    } catch (error) {
      this.logger.error(`Failed to create binarylane instance`, error);
      await this.destroyInstance(options);
      throw error;
    }
  }

  async destroyInstance(server: Server): Promise<void> {
    this.logger.debug(`Options: server(${server})`, "destroyInstance")

    // Find the server
    const targetServer = await this.getServerIdByName(`${server._id}.lighthouse.qixalite.com`)

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
    this.logger.debug(`Response: ${JSON.stringify(data)}`, "getServerIdByName")

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

    this.logger.debug(`Response: ${JSON.stringify(response.data)}`, "cloneBackupToServer")
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

      this.logger.debug(`Response: ${JSON.stringify(response.data)}`, "waitForActionToComplete")
      const action = response.data.action;

      if (action.status === "completed")
        return true;

      await sleep(1000);
    }

    return false;
  }
}