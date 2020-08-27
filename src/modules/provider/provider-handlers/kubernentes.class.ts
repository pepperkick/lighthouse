import { Handler, InstanceOptions } from "../handler.class";
import { Provider } from "../provider.model";
import * as yaml from "js-yaml";
import * as ApiClient from 'kubernetes-client';
import { BookingChart } from '../../booking/booking.chart';
import * as config from "../../../../config.json"

const { KubeConfig } = require('kubernetes-client')
const Request = require('kubernetes-client/backends/request')
const kubes = {};

export class KubernetesHandler extends Handler {	
	kube: ApiClient.ApiRoot;
	namespace: string

	constructor(provider: Provider) {
		super(provider);

		this.namespace = provider.metadata.namespace;

		if (kubes[provider._id]) 
			this.kube = kubes[provider._id];
		else {
			const kubeconfig = new KubeConfig()
			kubeconfig.loadFromString(provider.metadata.kubeconfig)
			const backend = new Request({ kubeconfig })
			const kube = new ApiClient.Client1_13({ backend, version: '1.13' });
	
			kubes[provider.id] = kube;
	
			this.kube = kubes[provider._id];
		}
	}

	async createInstance(options: InstanceOptions) {
		try {
			const port = await this.getFreePort();
			const data = {
				id: options.id,
				token: options.token, 
				image: this.provider.metadata.image,
				hostname: this.provider.metadata.hostname,
				servername: config.instance.hostname,
				ip: this.provider.metadata.ip, port, 
				password: options.password, 
				rconPassword: options.rconPassword, 
				tv: { port: port + 1, name: config.instance.tv_name },
				provider: { id: "", hostname: "" },
				selectors: {}
			}
		
			this.logger.debug(`Assigned address for id ${options.id} ${this.provider.metadata.ip}:${port}`);
	
			const chart = BookingChart.render(data);
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments.post({ body: yaml.load(chart) });
				
			data.provider = {
				id: this.provider.id,
				hostname: this.provider.metadata.hostname
			}
			data.selectors = this.provider.selectors;

			this.provider.inUse = [ ...this.provider.inUse, { id: options.id, port } ];
			await this.provider.save();
	
			return data;
		} catch (error) {
			this.logger.error("Failed to create kubernetes instance", error);
		}
	}

	async destroyInstance(id: string) {		
		try {
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments(`tf2-${id}`).delete();

			this.provider.inUse = this.provider.inUse.filter(e => e.id !== id);
			this.provider.save();
		} catch (error) {
			this.logger.error("Failed to delete kubernetes instance", error);
		}
	}
}