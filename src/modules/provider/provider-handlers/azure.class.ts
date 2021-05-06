import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as exec from "await-exec";
import { renderString } from "src/string.util";
import { Server } from '../../servers/server.model';
import { Game } from '../../games/game.model';
import { AZURE_STARTUP_SCRIPT } from '../../../assets/tf2';
import { Game as GameEnum } from '../../../objects/game.enum';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';

const STARTUP_SCRIPT = AZURE_STARTUP_SCRIPT

export class AzureHandler extends Handler {
	constructor(provider: Provider, game: Game) {
		super(provider);
		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.azure };
	}

	async createInstance(options: Server): Promise<Server> {
		let data, args;

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
		const script = renderString(STARTUP_SCRIPT, {
			id: data.id,
			image: data.image,
			args
		});
		this.logger.debug(`Script: ${script}`)
		
		try {
			const metadata = this.provider.metadata;	
			const group = `lighthouse-${data.id}`;
			await exec(`az login -u '${metadata.azureUsername}' -p '${metadata.azurePassword}'`);
			await exec(`az account set --subscription '${metadata.azureSubscriptionId}'`);
			await exec(`az group create --name ${group} --location ${metadata.azureLocation}`);
			await exec(`az vm create --resource-group ${group} --name ${group} --image '${metadata.azureImage}' --admin-username lighthouse --admin-password '${metadata.azureRootPassword}'`)
			await exec(`az vm run-command invoke --resource-group ${group} --name ${group} --command-id RunShellScript --scripts '${script}'`);
			await exec(`az network nsg rule create --resource-group ${group} --nsg-name ${group}NSG --name allow-game --access Allow --direction Inbound --source-port-ranges '*' --source-address-prefixes '*' --destination-port-ranges 27015 27020 --destination-address-prefixes '*' --protocol '*' --priority 2000`);
			await exec(`az network public-ip update -g ${group} -n ${group}PublicIP --idle-timeout 30`);
			const ip = await exec(`az vm show -d -g ${group} -n ${group} --query publicIps -o tsv`);
			const ip_str = ip.stdout.replace("\n", "");

			this.logger.debug(`Assigned azure IP ${ip_str}`);
			data.ip = ip_str;
			options.ip = ip_str;
			await options.save();
		} catch (error) {
			this.logger.error(`Failed to create azure instance`, error);
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

			this.logger.error(`Failed to destroy azure instance`, error);
			throw error;
		}
	}
} 