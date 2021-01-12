import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json";
import * as exec from "await-exec";
import { ServerChart } from "src/modules/servers/server.chart";
import { renderString } from "src/string.util";
import { Server } from '../../servers/server.model';
import { Game } from '../../games/game.model';

const STARTUP_SCRIPT = 
`docker run -d --network host {{ image }} {{ args }}`

export class AzureHandler extends Handler {
	constructor(provider: Provider, game: Game) {
		super(provider);
		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.azure };
	}

	async createInstance(options: Server): Promise<Server> {
		options.port = 27015;
		options.tvPort = 27020;

		const data = {
			...options.toJSON(),
			id: options._id,
			image: this.provider.metadata.image,
			tv: { enabled: true, port: 27020, name: config.instance.tv_name }
		}

		const args = ServerChart.getArgs(data);
		const script = renderString(STARTUP_SCRIPT, {
			id: data.id,
			image: data.image,
			args
		});
		
		try {
			const metadata = this.provider.metadata;	
			const group = `lighthouse-${data.id}`;
			await exec(`az login -u "${metadata.azureUsername}" -p "${metadata.azurePassword}"`);
			await exec(`az account set --subscription "${metadata.azureSubscriptionId}"`);
			await exec(`az group create --name ${group} --location ${metadata.azureLocation}`);
			await exec(`az vm create --resource-group ${group} --name ${group} --image "${metadata.azureImage}" --admin-username lighthouse --admin-password "${metadata.azureRootPassword}"`)
			await exec(`az vm run-command invoke --resource-group ${group} --name ${group} --command-id RunShellScript --scripts "${script}"`);
			await exec(`az network nsg rule create --resource-group ${group} --nsg-name ${group}NSG --name allow-game --access Allow --direction Inbound --source-port-ranges '*' --source-address-prefixes '*' --destination-port-ranges 27015 27020 --destination-address-prefixes '*' --protocol '*' --priority 2000`);
			const ip = await exec(`az vm show -d -g ${group} -n ${group} --query publicIps -o tsv`);
			const ip_str = ip.stdout.replace("\n", "");

			this.logger.debug(`Assigned azure IP ${ip_str}`);
			data.ip = ip_str;
			options.ip = ip_str;
			await options.save();
		} catch (error) {
			this.logger.error("Failed to create azure instance", error);
			throw error;
		}

		return options;
	}

	async destroyInstance(server: Server): Promise<void> {
		try {
			const metadata = this.provider.metadata;	
			const group = `lighthouse-${server.id}`;
			await exec(`az login -u "${metadata.azureUsername}" -p "${metadata.azurePassword}"`);
			await exec(`az account set --subscription "${metadata.azureSubscriptionId}"`);
			await exec(`az group delete --name ${group} --yes`);
		} catch (error) {
			if (error.message.includes("could not be found.")) {
				this.logger.log(`The azure resource group for ${server.id} was not found`);
				return;
			}

			this.logger.error("Failed to delete azure instance", error);
			throw error;
		}
	}
} 