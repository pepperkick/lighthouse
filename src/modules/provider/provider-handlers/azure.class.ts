import { BookingService } from "src/modules/booking/booking.service";
import { Handler, InstanceOptions } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json";
import * as exec from "await-exec";
import { BookingChart } from "src/modules/booking/booking.chart";
import { renderString } from "src/string.util";

const STARTUP_SCRIPT = 
`docker run -d --network host {{ image }} {{ args }}`

export class AzureHandler extends Handler {
	constructor(
		provider: Provider,
		bookingService: BookingService
	) {		
		super(provider, bookingService);
	}

	async createInstance(options: InstanceOptions) {
		const data = {
			id: options.id,
			token: options.token, 
			image: options.image || this.provider.metadata.image,
			servername: options.servername || config.instance.hostname,
			ip: null, port: 27015, 
			password: options.password, 
			rconPassword: options.rconPassword, 
			tv: { port: 27020, name: config.instance.tv_name },
			provider: { 
				id: this.provider.id,
				autoClose: this.provider.metadata.autoClose || { time: 905, min: 1 }
			},
			selectors: this.provider.selectors
		}

		const args = BookingChart.getArgs(data);
		const script = renderString(STARTUP_SCRIPT, {
			id: options.id,
			image: options.image || this.provider.metadata.image,
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
		} catch (error) {
			this.logger.error("Failed to create azure instance", error);
			throw error;
		}

		return data;
	}

	async destroyInstance(id: string) {
		try {
			const metadata = this.provider.metadata;	
			const group = `lighthouse-${id}`;
			await exec(`az login -u "${metadata.azureUsername}" -p "${metadata.azurePassword}"`);
			await exec(`az account set --subscription "${metadata.azureSubscriptionId}"`);
			await exec(`az group delete --name ${group} --yes`);
		} catch (error) {
			if (error.message.includes("could not be found.")) {
				this.logger.log(`The azure resource group for ${id} was not found`);
				return;
			}

			this.logger.error("Failed to delete azure instance", error);
			throw error;
		}
	}
} 