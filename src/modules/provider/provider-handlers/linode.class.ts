import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as sleep from 'await-sleep';
import { Linodev4 } from 'linode-v4';
import { Game as GameEnum } from '../../../objects/game.enum';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';
import { LINODE_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { LINODE_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { renderString } from '../../../string.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SSH2Promise = require('ssh2-promise');

export class LinodeHandler extends Handler {
  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.linode };
  }

  async createInstance(options: Server): Promise<Server> {
    this.logger.debug(`Options: options(${JSON.stringify(options, null, 2)})`, "createInstance")
    let STARTUP_SCRIPT = "", data, args;

    switch (options.game) {
      case GameEnum.TF2_COMP:
        if (!options.data) {
          options.data = {}
        }
        options.port = 27015
        options.tvPort = 27020
        options.data.hatchAddress = ":27017"
        options.data.hatchPassword = options.rconPassword
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
      const metadata = this.provider.metadata;
      const client = new Linodev4(metadata.linodeApiKey)

      let image;
      const images  = await client.images.list();

      for (const snapshot of images.data) {
        if (snapshot.label === metadata.linodeImageName) {
          image = snapshot.id;
        }
      }

      if (!image) {
        throw new Error(`Could not find snapshot with name "${metadata.linodeImageName}"`);
      }

      this.logger.log(`Found image id ${image}`)

      const instance = await client.linode.instances.create({
        image,
        label: `${data.id}`,
        authorized_keys: metadata.linodeSSHKeys,
        region: metadata.linodeRegion,
        root_pass: metadata.linodeRootPassword,
        type: metadata.linodeMachineSize,
        tags: [ `lighthouse`, `lighthouse-${data.id}`, options.game ]
      })

      this.logger.debug(`Instance: ${JSON.stringify(instance, null, 2)}`)

      let retry = 0;
      while (true) {
        const query = await client.linode.instances(instance.id).get()
        const ip = query?.ipv4[0]
        if (ip) {
          this.logger.debug(`Assigned Linode IP ${ip}`);
          data.ip = ip
          options.ip = ip;
          await options.save();
          break;
        }

        await sleep(2000);
        if (retry++ === 150) {
          throw new Error("Timeout waiting for the linode instance");
        }
      }

      const sshkey = Buffer.from(metadata.linodeSSHAccessKey, 'base64').toString('ascii');

      retry = 0;
      while (true) {
        const ip = options.ip;
        const ssh = new SSH2Promise({
          host: ip,
          username: 'root',
          privateKey: sshkey,
          reconnect: false,
          readyTimeout: 5000
        });

        try {
          await ssh.connect();
          await ssh.exec(script);
          await ssh.close();
          break
        } catch (error) {
          this.logger.error(`Failed to execute SSH command, Retry ${retry}`, error)
        }

        await sleep(2000);
        if (retry++ === 100) {
          throw new Error("Timeout trying to SSH to linode instance");
        }
      }

      return options;
    } catch (error) {
      this.logger.error(`Failed to create linode instance`, error);
      await this.destroyInstance(options);
      throw error;
    }
  }

  async destroyInstance(server: Server): Promise<void> {
    this.logger.debug(`Options: server(${server})`, "destroyInstance")
    try {
      const metadata = this.provider.metadata;
      const client = new Linodev4(metadata.linodeApiKey)
      const instances = await client.linode.instances.list()

      let id;

      for (const instance of instances.data) {
        if (instance.label === `${server.id}`) {
          id = instance.id;
        }
      }

      if (!id) {
        throw new Error(`Failed to find instance with id "${server.id}"`)
      }

      await client.linode.instances(id).delete()
    } catch (error) {
      this.logger.error(`Failed to destroy linode instance`, error);
      throw error;
    }
  }
}