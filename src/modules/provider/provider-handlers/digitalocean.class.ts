import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import * as sleep from 'await-sleep';
import { createApiClient } from 'dots-wrapper';
import { Server } from '../../servers/server.model';
import { Game } from '../../games/game.model';
import { DIGITAL_OCEAN_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { DIGITAL_OCEAN_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { DIGITAL_OCEAN_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import * as config from '../../../../config.json';

const label = config.instance.label;

export class DigitalOceanHandler extends Handler {
  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = {
      ...provider.metadata,
      ...game.data.providerOverrides.digital_ocean,
    };
  }

  async createInstance(server: Server): Promise<Server> {
    const [_server, script] = this.getDefaultOptions(server, {
      tf2: TF2_STARTUP_SCRIPT,
      minecraft: MINECRAFT_STARTUP_SCRIPT,
      valheim: VALHEIM_STARTUP_SCRIPT,
    });
    server = _server;

    try {
      let image;
      const metadata = this.provider.metadata;
      const client = createApiClient({
        token: this.provider.metadata.digitalOceanToken,
      });
      const {
        data: { snapshots },
      } = await client.snapshot.listSnapshots({});

      for (const snapshot of snapshots) {
        if (snapshot.name === metadata.digitalOceanImageName) {
          image = snapshot.id;
        }
      }

      if (!image) {
        throw new Error(
          `Could not find snapshot with name "${metadata.digitalOceanImageName}"`,
        );
      }

      this.logger.log(`Found image id ${image}`);

      const {
        data: { droplet },
      } = await client.droplet.createDroplet({
        name: `${label}-${server.id}`,
        region: metadata.digitalOceanRegion,
        size: metadata.digitalOceanMachineType,
        image,
        tags: [`lighthouse`, label, `${label}-${server.id}`, server.game],
        user_data: script,
        ssh_keys: [metadata.digitalOceanSSHKeyId],
      });

      this.logger.debug(`Droplet: ${JSON.stringify(droplet, null, 2)}`);

      let retry = 0;
      while (true) {
        const query = await client.droplet.getDroplet({
          droplet_id: droplet.id,
        });
        const ip = query?.data?.droplet?.networks?.v4.filter(
          ele => ele.type === 'public',
        )[0]?.ip_address;
        if (ip) {
          this.logger.debug(`Assigned Digital Ocean IP ${ip}`);
          server.ip = ip;
          await server.save();
          break;
        }

        await sleep(2000);
        if (retry++ === 150) {
          throw new Error('Timeout waiting for the droplet instance');
        }
      }

      return server;
    } catch (error) {
      this.logger.error(`Failed to create digital ocean instance`, error);
      await this.destroyInstance(server);
      throw error;
    }
  }

  async destroyInstance(server: Server): Promise<void> {
    try {
      const client = createApiClient({
        token: this.provider.metadata.digitalOceanToken,
      });
      await client.droplet.deleteDropletsByTag({
        tag_name: `${label}-${server.id}`,
      });
    } catch (error) {
      this.logger.error(`Failed to destroy digital ocean instance`, error);
      throw error;
    }
  }
}
