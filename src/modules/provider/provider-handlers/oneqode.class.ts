import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as Ansible from 'node-ansible';
import {
  ONEQODE_CREATE_PLAYBOOK as CREATE_PLAYBOOK,
  ONEQODE_DESTROY_PLAYBOOK as DESTROY_PLAYBOOK,
} from '../../../assets/common';
import { ONEQODE_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { ONEQODE_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { ONEQODE_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import { renderString } from '../../../string.util';
import * as config from '../../../../config.json';
import { readFileSync, writeFileSync } from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SSH2Promise = require('ssh2-promise');
const label = config.instance.label;

export class OneqodeHandler extends Handler {
  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = {
      ...provider.metadata,
      ...game.data.providerOverrides.oneqode,
    };
  }

  async createInstance(server: Server): Promise<Server> {
    const [_server, script] = this.getDefaultOptions(server, {
      tf2: TF2_STARTUP_SCRIPT,
      minecraft: MINECRAFT_STARTUP_SCRIPT,
      valheim: VALHEIM_STARTUP_SCRIPT,
    });
    server = _server;

    const playbook = renderString(CREATE_PLAYBOOK, {
      app: label,
      id: server.id,
      startup_script: Buffer.from(script).toString('base64'),
      key_path: `./oneqode-${server.id}.key`,
      region: this.provider.metadata.oneqodeRegion,
      username: this.provider.metadata.oneqodeUsername,
      password: this.provider.metadata.oneqodePassword,
      project_id: this.provider.metadata.oneqodeProject,
      image: this.provider.metadata.oneqodeImageName,
      flavor: this.provider.metadata.oneqodeFlavor,
      key_name: this.provider.metadata.oneqodeKey,
      zone: this.provider.metadata.oneqodeZone,
    });

    try {
      writeFileSync(`./oneqode-playbook-${server.id}-create.yml`, playbook);

      const command = new Ansible.Playbook().playbook(
        `oneqode-playbook-${server.id}-create`,
      );
      const result = await command.exec();
      this.logger.log(result);

      const ip = readFileSync(`./oneqode-ip-${server.id}`, 'utf8');
      server.ip = ip.trim();
      await server.save();

      const sshKey = this.provider.metadata.oneqodeSSHAccessKey;
      writeFileSync(`./oneqode-${server.id}.key`, sshKey);

      // Connect via ssh
      const sshconfig = {
        host: server.ip,
        username: 'debian',
        identity: `./oneqode-${server.id}.key`,
      };
      this.logger.log('Connecting to server via SSH...');
      const ssh = new SSH2Promise(sshconfig);
      await ssh.connect();
      this.logger.log('Sending startup command...');
      await ssh.exec(script);
      await ssh.close();
      this.logger.log('SSH connection closed');
    } catch (error) {
      this.logger.error(`Failed to create oneqode instance`, error);
      throw error;
    }

    return server;
  }

  async destroyInstance(server: Server): Promise<void> {
    const playbook = renderString(DESTROY_PLAYBOOK, {
      app: label,
      id: server.id,
      region: this.provider.metadata.oneqodeRegion,
      username: this.provider.metadata.oneqodeUsername,
      password: this.provider.metadata.oneqodePassword,
      project_id: this.provider.metadata.oneqodeProject,
    });

    try {
      writeFileSync(`./oneqode-playbook-${server.id}-destroy.yml`, playbook);

      const command = new Ansible.Playbook().playbook(
        `oneqode-playbook-${server.id}-destroy`,
      );
      const result = await command.exec();
      this.logger.log(result);
    } catch (error) {
      this.logger.error(`Failed to destroy oneqode instance`, error);
      throw error;
    }
  }
}
