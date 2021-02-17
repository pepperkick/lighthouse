import * as Compute from "@google-cloud/compute";
import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json"
import { writeFileSync } from "fs";
import { ServerChart } from "src/modules/servers/server.chart";
import { renderString } from "src/string.util";
import * as Ansible from "node-ansible";
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';

const STARTUP_SCRIPT = 
`           #! /bin/bash
            
            export BOOKING_ID={{ id }}
            
            while : ; do
              if sudo iptables -L INPUT | grep -i "policy accept"; then
                break
              else
                sudo iptables -P INPUT ACCEPT
              fi
            done
            
            while : ; do
              if sudo iptables -L OUTPUT | grep -i "policy accept"; then
                break
              else
                sudo iptables -P OUTPUT ACCEPT
              fi
            done
            
            docker run --network host {{ image }} {{ args }}`
const CREATE_PLAYBOOK =
`
- name: Create Booking in GCloud
  hosts: localhost
  gather_facts: no  
  vars:
    gcp_cred_kind: serviceaccount
  tasks:
  - name: Create a Address
    gcp_compute_address:
      name: '{{ app }}-{{ id }}'
      region: "{{ region }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: present
    register: address
  - name: Create an instance
    gcp_compute_instance:
      state: present
      name: "{{ app }}-{{ id }}"
      machine_type: {{ machine_type }}
      network_interfaces:
      - access_configs:
        - name: External NAT
          nat_ip: "{{ address }}"
          type: ONE_TO_ONE_NAT
      disks:
      - auto_delete: true
        boot: true
        initialize_params: 
          source_image: "{{ image }}"
      metadata:
        startup-script: >-
{{ startup_script }}
      zone: "{{ zone }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
`
const DESTROY_PLAYBOOK =
`
- name: Destroy Booking in GCloud
  hosts: localhost
  gather_facts: no  
  vars:
    gcp_cred_kind: serviceaccount
  tasks:
  - name: Delete the instance
    gcp_compute_instance:
      name: "{{ app }}-{{ id }}"
      zone: "{{ zone }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: absent
  - name: Delete the Address
    gcp_compute_address:
      name: '{{ app }}-{{ id }}'
      region: "{{ region }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: absent
`
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
		options.port = 27015;
		options.tvPort = 27020;

		const data = {
			...options.toJSON(),
			id: options._id,
			image: this.provider.metadata.image,
			tv: { enabled: true, port: 27020, name: config.instance.tv_name }
		}

		const args = ServerChart.getArgs(data)
		const script = renderString(STARTUP_SCRIPT, {
			id: data.id,
			image: data.image,
			args
		})

		const playbook = renderString(CREATE_PLAYBOOK, {
			app: "tf2",
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
			this.logger.error("Failed to create instance", error);
			throw error;
		}	

		return options;
  }
  
	async destroyInstance(server: Server): Promise<void> {
		const playbook = renderString(DESTROY_PLAYBOOK, {
			app: "tf2",
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
			this.logger.error("Failed to destroy instance", error);
			throw error;			
		}
	}
}