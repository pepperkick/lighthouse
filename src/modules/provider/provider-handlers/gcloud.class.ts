import * as Compute from "@google-cloud/compute";
import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import { writeFileSync } from "fs";
import { renderString } from "src/string.util";
import * as Ansible from "node-ansible";
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import * as config from "../../../../config.json"
import { GCP_CREATE_PLAYBOOK, GCP_DESTROY_PLAYBOOK } from "../../../assets/common"
import { GCP_STARTUP_SCRIPT as TF2_STARTUP_SCRIPT } from '../../../assets/tf2';
import { GCP_STARTUP_SCRIPT as VALHEIM_STARTUP_SCRIPT } from '../../../assets/valheim';
import { GCP_STARTUP_SCRIPT as MINECRAFT_STARTUP_SCRIPT } from '../../../assets/minecraft';

const CREATE_PLAYBOOK = GCP_CREATE_PLAYBOOK
const DESTROY_PLAYBOOK = GCP_DESTROY_PLAYBOOK
const label = config.instance.label

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

	async createInstance(server: Server): Promise<Server> {
		const [_server, script] = this.getDefaultOptions(server, {
			tf2: TF2_STARTUP_SCRIPT,
			minecraft: MINECRAFT_STARTUP_SCRIPT,
			valheim: VALHEIM_STARTUP_SCRIPT
		})
		server = _server

		const playbook = renderString(CREATE_PLAYBOOK, {
			app: label,
			gcp_cred_file: `./gcloud-${this.provider.id}-${this.project}.key.json`,
			project: this.project,
			id: server.id,
			zone: this.provider.metadata.gcpZone,
			region: this.provider.metadata.gcpRegion,
			image: this.provider.metadata.gcpVmImage,
			machine_type: this.provider.metadata.gcpMachineType,
			startup_script: script       
		});
		
		try {
			writeFileSync(`./gcloud-playbook-${server.id}-create.yml`, playbook);

			const command = new Ansible.Playbook().playbook(`gcloud-playbook-${server.id}-create`);
			const result = await command.exec();
			this.logger.log(result);

			const address = this.region.address(`${label}-${server.id}`);
			const address_data = await address.get();

			server.ip = (await address_data[0].getMetadata())[0].address;
			await server.save();
		}	catch (error) {
			this.logger.error(`Failed to create gcloud instance`, error);
			throw error;
		}	

		return server;
  }
  
	async destroyInstance(server: Server): Promise<void> {
		const playbook = renderString(DESTROY_PLAYBOOK, {
			app: label,
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