import * as Compute from "@google-cloud/compute";
import { Handler, InstanceOptions } from "../handler.class";
import { Provider } from "../provider.model";
import * as config from "../../../../config.json"
import { writeFileSync } from "fs";
import { BookingChart } from "src/modules/booking/booking.chart";
import { BookingService } from "src/modules/booking/booking.service";
import { renderString } from "src/string.util";
import * as Ansible from "node-ansible";

const STARTUP_SCRIPT = 
`
            #! /bin/bash
            
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
            
            docker run --network host {{ image }} {{ args }}
`
const CREATE_PLAYBOOK =
`
- name: Create Booking in GCloud
  hosts: localhost
  gather_facts: no  
  vars:
    gcp_cred_kind: serviceaccount
  tasks:
  - name: Create a disk
    gcp_compute_disk:
      name: '{{ app }}-{{ id }}'
      size_gb: 20
      source_image: '{{ image }}'
      zone: "{{ zone }}"
      project: "{{ project }}"
      auth_kind: "{{ gcp_cred_kind }}"
      service_account_file: "{{ gcp_cred_file }}"
      state: present
    register: disk
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
        source: "{{ disk }}"
      metadata:
        items:
        - key: "startup-script"
          value: >-
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
  - name: Delete the disk
    gcp_compute_disk:
      name: '{{ app }}-{{ id }}'
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

	constructor(
		provider: Provider,
		bookingService: BookingService
	) {
		super(provider, bookingService);

		this.config = JSON.parse(provider.metadata.gcloudconfig);
		this.project = this.config.project_id;
		
		writeFileSync(`./gcloud-${provider.id}-${this.project}.key.json`, JSON.stringify(this.config));

		this.compute = new Compute({
			projectId: this.project, 
			keyFilename: `./gcloud-${provider.id}-${this.project}.key.json`
		});
		this.zone = this.compute.zone(provider.metadata.zone);
		this.region = this.compute.region(provider.metadata.region);
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
		const args = BookingChart.getArgs(data)
		const script = renderString(STARTUP_SCRIPT, {
			id: options.id,
			image: options.image,
			args
		})
		const playbook = renderString(CREATE_PLAYBOOK, {
			app: "tf2",
			gcp_cred_file: `./gcloud-${this.provider.id}-${this.project}.key.json`,
			project: this.project,
			id: options.id,
			zone: this.provider.metadata.zone,
			region: this.provider.metadata.region,
			image: this.provider.metadata.vmImage,
			machine_type: this.provider.metadata.machineType,
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
		}	catch (error) {
			this.logger.error("Failed to create instance", error);
			throw error;
		}	

		return data;
  }
  
	async destroyInstance(id: string) {
		const playbook = renderString(DESTROY_PLAYBOOK, {
			app: "tf2",
			gcp_cred_file: `./gcloud-${this.provider.id}-${this.project}.key.json`,
			project: this.project,
			id: id,
			zone: this.provider.metadata.zone,
			region: this.provider.metadata.region,
			image: this.provider.metadata.vmImage 
		});

		try {
			writeFileSync(`./gcloud-playbook-${id}-destroy.yml`, playbook);

			const command = new Ansible.Playbook().playbook(`gcloud-playbook-${id}-destroy`);
			const result = await command.exec();
			this.logger.log(result);
		} catch (error) {
			this.logger.error("Failed to destroy instance", error);
			throw error;			
		}
	}

	// async createInstance(options: InstanceOptions) {
	// 	const address = this.region.address(`tf2-${options.id}`);
	// 	let ip;

	// 	try {
	// 		const address_data = await address.create();
	// 		await address_data[1].promise();
	// 		ip = (await address_data[0].getMetadata())[0].address;
	// 	} catch (error) {
	// 		if (error.code === 409 && error.errors.filter(e => e.reason === "alreadyExists").length > 0) {
	// 			this.logger.warn("Failed to create address as it already exists, reusing it.");
	// 			const address_data = await address.get();
	// 			ip = (await address_data[0].getMetadata())[0].address;
	// 		} else {
	// 			this.logger.error("Failed to create address", error);	
	// 			throw error;
	// 		}
	// 	}

	// 	this.logger.debug(`Got GCloud IP ${ip} for booking ${options.id}`);
		
	// 	const data = {
	// 		id: options.id,
	// 		token: options.token, 
	// 		image: options.image || this.provider.metadata.image,
	// 		servername: options.servername || config.instance.hostname,
	// 		ip: null, port: 27015, 
	// 		password: options.password, 
	// 		rconPassword: options.rconPassword, 
	// 		tv: { port: 27020, name: config.instance.tv_name },
	// 		provider: { 
	// 			id: this.provider.id,
	// 			autoClose: this.provider.metadata.autoClose || { time: 905, min: 1 }
	// 		},
	// 		selectors: this.provider.selectors
	// 	}

	// 	try {
	// 		const vm_data =  await this.zone.createVM(`tf2-${options.id}`, {
	// 			os: this.provider.metadata.vmImage,
	// 			machineType: this.provider.metadata.machineType,
	// 			networkInterfaces: [ { accessConfigs: {
	// 				name: "External NAT",
	// 				type: "ONE_TO_ONE_NAT",
  //         networkTier: "PREMIUM",
	// 				natIP: ip
	// 			} } ],
	// 			metadata: {
	// 				items: [ { 
	// 					key: "startup-script",
	// 					value: 
	// 						`
	// 						#! /bin/bash

	// 						export BOOKING_ID=${data.id}

	// 						while : ; do
	// 							if sudo iptables -L INPUT | grep -i "policy accept"; then
	// 								break
	// 							else
	// 								sudo iptables -P INPUT ACCEPT
	// 							fi
	// 						done

	// 						while : ; do
	// 							if sudo iptables -L OUTPUT | grep -i "policy accept"; then
	// 								break
	// 							else
	// 								sudo iptables -P OUTPUT ACCEPT
	// 							fi
	// 						done
	
	// 						docker run --network host ${this.provider.metadata.image} ${BookingChart.getArgs(data)}
	// 						`
	// 				} ]
	// 			}
	// 		});
	
	// 		data.ip = ip

	// 		await vm_data[1].promise();
	// 	} catch (error) {
	// 		this.logger.error("Failed to create VM", error);

	// 		try {
	// 			const address = this.region.address(`tf2-${options.id}`);
	// 			const address_data = await address.delete();
	// 			await address_data[0].promise();
	// 		} catch (error) {
	// 			this.logger.error("Failed to delete address for failed VM", error);				
	// 		}

	// 		throw error;
	// 	}

	// 	return data;
	// }

	// async destroyInstance(id: string) {
	// 	try {
	// 		const address = this.region.address(`tf2-${id}`);
	// 		const address_data = await address.delete();
	// 		await address_data[0].promise();
	// 	} catch (error) {
	// 		this.logger.error("Failed to remove address", error);
	// 	}

	// 	try {
	// 		const vm = this.zone.vm(`tf2-${id}`);
	// 		const vm_data = await vm.delete();
	// 		await vm_data[0].promise();
	// 	} catch (error) {
	// 		this.logger.error("Failed to remove vm", error);
	// 	}
	// }
}