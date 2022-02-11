import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import * as exec from 'await-exec';
import { Server } from '../../servers/server.model';
import { Game } from '../../games/game.model';
import { AZURE_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { AZURE_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { AZURE_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';
import * as config from '../../../../config.json';

const label = config.instance.label;

export class AzureHandler extends Handler {
  constructor(provider: Provider, game: Game) {
    super(provider);
    provider.metadata = {
      ...provider.metadata,
      ...game.data.providerOverrides.azure,
    };
  }

  async createInstance(server: Server): Promise<Server> {
    const [_server, script] = this.getDefaultOptions(server, {
      tf2: TF2_STARTUP_SCRIPT,
      minecraft: MINECRAFT_STARTUP_SCRIPT,
      valheim: VALHEIM_STARTUP_SCRIPT,
    });
    server = _server;

    // Workaround for azure script removing single quotes
    const _script = script.replace(/'/g, '"');
    this.logger.debug(`Script: ${_script}`);

    try {
      const metadata = this.provider.metadata;
      const group = `${label}-${server.id}`;
      await exec(
        `az login -u '${metadata.azureUsername}' -p '${metadata.azurePassword}'`,
      );
      await exec(
        `az account set --subscription '${metadata.azureSubscriptionId}'`,
      );
      await exec(
        `az group create --name ${group} --location ${metadata.azureLocation}`,
      );
      await exec(
        `az vm create --resource-group ${group} --name ${group} --image '${metadata.azureImage}' --admin-username lighthouse --admin-password '${metadata.azureRootPassword}'`,
      );
      await exec(
        `az vm run-command invoke --resource-group ${group} --name ${group} --command-id RunShellScript --scripts '${_script}'`,
      );
      await exec(
        `az network nsg rule create --resource-group ${group} --nsg-name ${group}NSG --name allow-game --access Allow --direction Inbound --source-port-ranges '*' --source-address-prefixes '*' --destination-port-ranges 27015-27020 --destination-address-prefixes '*' --protocol '*' --priority 2000`,
      );
      await exec(
        `az network public-ip update -g ${group} -n ${group}PublicIP --idle-timeout 30`,
      );
      const ip = await exec(
        `az vm show -d -g ${group} -n ${group} --query publicIps -o tsv`,
      );
      const ip_str = ip.stdout.replace('\n', '');

      this.logger.debug(`Assigned azure IP ${ip_str}`);
      server.ip = ip_str;
      await server.save();
    } catch (error) {
      this.logger.error(`Failed to create azure instance`, error);
      throw error;
    }

    return server;
  }

  async destroyInstance(server: Server): Promise<void> {
    try {
      const metadata = this.provider.metadata;
      const group = `${label}-${server.id}`;
      await exec(
        `az login -u "${metadata.azureUsername}" -p "${metadata.azurePassword}"`,
      );
      await exec(
        `az account set --subscription "${metadata.azureSubscriptionId}"`,
      );
      await exec(`az group delete --name ${group} --yes`);
    } catch (error) {
      if (error.message.includes('could not be found.')) {
        this.logger.log(
          `The azure resource group for ${server.id} was not found`,
        );
        return;
      }

      this.logger.error(`Failed to destroy azure instance`, error);
      throw error;
    }
  }
}
