import * as Compute from "@google-cloud/compute";
import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import { writeFileSync } from "fs";
import { renderString } from "src/string.util";
import * as Ansible from "node-ansible";
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import { Game as GameEnum } from '../../../objects/game.enum';
import { GCP_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT, GCP_CREATE_PLAYBOOK, GCP_DESTROY_PLAYBOOK } from '../../../assets/tf2';
import { GCP_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';

const CREATE_PLAYBOOK = GCP_CREATE_PLAYBOOK
const DESTROY_PLAYBOOK = GCP_DESTROY_PLAYBOOK

export class GCloudHandler extends Handler {
	compute: any
	zone: any
	region: any
	config: any
	project: string

	constructor(provider: Provider, game: Game) {
		super(provider);

		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.gcp };

		this.config = JSON.parse(provider.metadata.gcpConfig);
		this.project = this.config.project_id;
		
		writeFileSync(`./gcloud-${provider.id}-${this.project}.key.json`, JSON.stringify(this.config));

		this.compute = new Compute({
			projectId: this.project, 
			keyFilename: `./gcloud-${provider.id}-${this.project}.key.json`
		});
		this.zone = this.compute.zone(provider.metadata.gcpZone);
		this.region = this.compute.region(provider.metadata.gcpRegion);
	}

	async createInstance(options: Server): Promise<Server> {
		let STARTUP_SCRIPT = "", app = "", data, args;

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
				app = "tf2"
				break
			case GameEnum.VALHEIM:
				STARTUP_SCRIPT = VALHEIM_STARTUP_SCRIPT
				app = "valheim"
				break
		}

		const script = renderString(STARTUP_SCRIPT, {
			id: data.id,
			image: data.image,
			args
		})
		this.logger.debug(`Script: ${script}`)

		const playbook = renderString(CREATE_PLAYBOOK, {
			app,
			gcp_cred_file: `./gcloud-${this.provider.id}-${this.project}.key.json`,
			project: this.project,
			id: options.id,
			zone: this.provider.metadata.gcpZone,
			region: this.provider.metadata.gcpRegion,
			image: this.provider.metadata.gcpVmImage,
			machine_type: this.provider.metadata.gcpMachineType,
			startup_script: script       
		});
		
		try {
			writeFileSync(`./gcloud-playbook-${options.id}-create.yml`, playbook);

			const command = new Ansible.Playbook().playbook(`gcloud-playbook-${options.id}-create`);
			const result = await command.exec();
			this.logger.log(result);

			const address = this.region.address(`tf2-${options.id}`);
			const address_data = await address.get();
			const ip = (await address_data[0].getMetadata())[0].address;

			data.ip = ip;
			options.ip = ip;
			await options.save();
		}	catch (error) {
			this.logger.error(`Failed to create gcloud instance`, error);
			throw error;
		}	

		return options;
  }
  
	async destroyInstance(server: Server): Promise<void> {
		let app = "";

		switch (server.game) {
			case GameEnum.TF2_COMP:
				app = "tf2"
				break
			case GameEnum.VALHEIM:
				app = "valheim"
				break
		}

		const playbook = renderString(DESTROY_PLAYBOOK, {
			app,
			gcp_cred_file: `./gcloud-${this.provider.id}-${this.project}.key.json`,
			project: this.project,
			id: server.id,
			zone: this.provider.metadata.gcpZone,
			region: this.provider.metadata.gcpRegion,
			image: this.provider.metadata.gcpVmImage
		});

		try {
			writeFileSync(`./gcloud-playbook-${server.id}-destroy.yml`, playbook);

			const command = new Ansible.Playbook().playbook(`gcloud-playbook-${server.id}-destroy`);
			const result = await command.exec();
			this.logger.log(result);
		} catch (error) {
			this.logger.error(`Failed to destroy gcloud instance`, error);
			throw error;			
		}
	}
}