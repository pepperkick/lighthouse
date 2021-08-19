import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as sleep from 'await-sleep';
import { Linodev4 } from 'linode-v4';
import { LINODE_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { LINODE_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { LINODE_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import * as config from '../../../../config.json';

const label = config.instance.label
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SSH2Promise = require('ssh2-promise');

export class LinodeHandler extends Handler {
  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.linode };
  }

  async createInstance(server: Server): Promise<Server> {
    const [_server, script] = this.getDefaultOptions(server, {
      tf2: TF2_STARTUP_SCRIPT,
      minecraft: MINECRAFT_STARTUP_SCRIPT,
      valheim: VALHEIM_STARTUP_SCRIPT
    })
    server = _server

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
        label: `${server.id}`,
        authorized_keys: metadata.linodeSSHKeys,
        region: metadata.linodeRegion,
        root_pass: metadata.linodeRootPassword,
        type: metadata.linodeMachineSize,
        tags: [ `lighthouse`, label, `${label}-${server.id}`, server.game ]
      })

      this.logger.debug(`Instance: ${JSON.stringify(instance, null, 2)}`, "waitingForIP")

      let retry = 0;
      while (true) {
        const query = await client.linode.instances(instance.id).get()
        const ip = query?.ipv4[0]
        if (ip) {
          this.logger.debug(`Assigned Linode IP ${ip}`);
          server.ip = ip;
          await server.save();
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
        const ip = server.ip;
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
          this.logger.warn(`Failed to execute SSH command, Retry ( ${retry} / 180 )`, "waitingForSSH")
          this.logger.warn(error, "waitingForSSH")
        }

        await sleep(5000);

        if (retry++ === 180) {
          throw new Error("Timeout trying to SSH to linode instance");
        }
      }

      return server;
    } catch (error) {
      this.logger.error(`Failed to create linode instance`, error);
      await this.destroyInstance(server);
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