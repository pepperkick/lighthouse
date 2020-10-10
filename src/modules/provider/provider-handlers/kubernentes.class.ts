import { Handler, InstanceOptions } from "../handler.class";
import { Provider } from "../provider.model";
import * as yaml from "js-yaml";
import * as ApiClient from 'kubernetes-client';
import { BookingChart } from '../../booking/booking.chart';
import * as config from "../../../../config.json"
import { BookingService } from "src/modules/booking/booking.service";

const { KubeConfig } = require('kubernetes-client')
const Request = require('kubernetes-client/backends/request')
const kubes = {};

export class KubernetesHandler extends Handler {	
	kube: ApiClient.ApiRoot;
	namespace: string

	constructor(
		provider: Provider,
		bookingService: BookingService
	) {
		super(provider, bookingService);

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
			const port = options.port || await this.getFreePort();
			const data = {
				id: options.id,
				token: options.token, 
				image: options.image || this.provider.metadata.image,
				hostname: this.provider.metadata.hostname,
				servername: options.servername || config.instance.hostname,
				ip: this.provider.metadata.ip, port, 
				password: options.password, 
				rconPassword: options.rconPassword, 
				tv: { port: port + 1, name: config.instance.tv_name },
				provider: { id: "", hostname: "", autoClose: { time: 905, min: 2 } },
				selectors: {}
			}
		
			this.logger.debug(`Assigned address for id ${options.id} ${this.provider.metadata.ip}:${port}`);
	
			const chart = BookingChart.render(data);
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments.post({ body: yaml.load(chart) });
				
			data.provider = {
				id: this.provider.id,
				hostname: this.provider.metadata.hostname,
				autoClose: this.provider.metadata.autoClose
			}
			data.selectors = this.provider.selectors;
	
			return data;
		} catch (error) {
			this.logger.error("Failed to create kubernetes instance", error);
		}
	}

	async destroyInstance(id: string) {		
		try {
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments(`tf2-${id}`).delete();
		} catch (error) {
			this.logger.error("Failed to delete kubernetes instance", error);
		}
	}
}