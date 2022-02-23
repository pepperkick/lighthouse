import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as Ansible from 'node-ansible';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  AWS_CREATE_PLAYBOOK as CREATE_PLAYBOOK,
  AWS_DESTROY_PLAYBOOK as DESTROY_PLAYBOOK,
} from '../../../assets/common';
import {
  AWS_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT,
  AWS_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT,
  AWS_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT,
} from '../../../assets/common';
import { renderString } from '../../../string.util';
import * as config from '../../../../config.json';
import { writeFileSync } from 'fs';

const label = config.instance.label;

export class AWSHandler extends Handler {
  client: EC2Client;

  constructor(provider: Provider, game: Game) {
    super(provider);

    provider.metadata = {
      ...provider.metadata,
      ...game.data.providerOverrides.aws,
    };

    this.client = new EC2Client({
      credentials: {
        accessKeyId: provider.metadata.awsAccessKey,
        secretAccessKey: provider.metadata.awsSecretKey,
      },
      region: provider.metadata.awsRegion,
    });
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
      region: this.provider.metadata.awsRegion,
      aws_access_key: this.provider.metadata.awsAccessKey,
      aws_secret_key: this.provider.metadata.awsSecretKey,
      aws_image_name: this.provider.metadata.awsImageName,
      aws_subnet_id: this.provider.metadata.awsSubnetId,
      aws_instance_type: this.provider.metadata.awsInstanceType,
      aws_key_name: this.provider.metadata.awsKeyName,
      aws_security_group: this.provider.metadata.awsSecurityGroupId,
    });

    try {
      writeFileSync(`./aws-playbook-${server.id}-create.yml`, playbook);

      const command = new Ansible.Playbook().playbook(
        `aws-playbook-${server.id}-create`,
      );
      const result = await command.exec();
      this.logger.log(result);

      const awsCommand = new DescribeInstancesCommand({
        Filters: [
          {
            Name: 'tag:Name',
            Values: [`${label}-${server.id}`],
          },
        ],
      });

      const instances = await this.client.send(awsCommand);
      server.ip = instances.Reservations[0].Instances[0].PublicIpAddress;
      await server.save();
    } catch (error) {
      this.logger.error(`Failed to create aws instance`, error);
      throw error;
    }

    return server;
  }

  async destroyInstance(server: Server): Promise<void> {
    const playbook = renderString(DESTROY_PLAYBOOK, {
      app: label,
      id: server.id,
      region: this.provider.metadata.awsRegion,
      aws_access_key: this.provider.metadata.awsAccessKey,
      aws_secret_key: this.provider.metadata.awsSecretKey,
    });

    try {
      writeFileSync(`./aws-playbook-${server.id}-destroy.yml`, playbook);

      const command = new Ansible.Playbook().playbook(
        `aws-playbook-${server.id}-destroy`,
      );
      const result = await command.exec();
      this.logger.log(result);
    } catch (error) {
      this.logger.error(`Failed to destroy aws instance`, error);
      throw error;
    }
  }
}
