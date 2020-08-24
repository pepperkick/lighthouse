import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as yaml from "js-yaml";
import * as ApiClient from 'kubernetes-client';
import { Provider, ProviderType } from "./provider.model";
import { BookingChart } from '../booking/booking.chart';
import * as config from "../../../config.json"
import { stat } from "fs";

const { KubeConfig } = require('kubernetes-client')
const Request = require('kubernetes-client/backends/request')

export interface InstanceOptions {
	id: string
	token: string
	password?: string
	rconPassword?: string
}

@Injectable()
export class ProviderService {
	private readonly logger = new Logger(ProviderService.name);
	private readonly kubes = {};

	constructor(@InjectModel(Provider.name) private Provider: Model<Provider>) { 
		setTimeout(async () => {
			const provider = await this.find({
				region: "sydney",
				env: "dev",
				tier: "free"
			});

			// await this.createInstance(provider);
		}, 0);
	}

	/**
	 * Find a free provider based on selectors provided 
	 * 
	 * @param selectors Selectors to use while searching for provider
	 */
	async find(selectors: object) {
		return this.Provider.findOne({ $and: [ { selectors }, { $where: "this.limit > this.inUse.length" } ] });
	}

	async status() {
		const providers = await this.Provider.find();
		const data = [];

		for (let provider of providers) {
			data.push({
				id: provider.id,
				limit: provider.limit,
				inUse: provider.inUse.length,
				hostname: provider.hostname,
				ip: provider.ip,
				...provider.selectors
			});
		}

		return data;
	}

	async createInstance(provider: Provider, options: InstanceOptions) {
		this.logger.debug(`Creating instance for id ${options.id} at ${provider.hostname}`);
		
		switch(provider.type) {
			case ProviderType.ClusterNode:
				return this.createKubernetesInstance(provider, options);
		}
	}

	async createKubernetesInstance(provider: Provider, options: InstanceOptions) {
		try {
			const kube = await this.getKubeClient(provider);
			const port = await this.getFreePort(provider);
			const data = {
				id: options.id,
				token: options.token, 
				image: `${config.instance.image.name}:${config.instance.image.tag}`,
				hostname: provider.hostname,
				servername: config.instance.hostname,
				ip: provider.ip, port, 
				password: options.password, 
				rconPassword: options.rconPassword, 
				tv: { port: port + 1, name: config.instance.tv_name },
				provider: { id: "", hostname: "" },
				selectors: {}
			}
		
			this.logger.debug(`Assigned address for id ${options.id} ${provider.ip}:${port}`);
	
			const chart = BookingChart.render(data);
			await kube.apis.app.v1
				.namespaces(provider.metadata.namespace).deployments.post({ body: yaml.load(chart) });
				
			data.provider = {
				id: provider.id,
				hostname: provider.hostname
			}
			data.selectors = provider.selectors;

			provider.inUse = [ ...provider.inUse, { id: options.id, port } ];
			await provider.save();
	
			return data;
		} catch (error) {
			this.logger.error("Failed to create kubernetes instance", error);
		}
	}

	async deleteInstance(pid: string, id: string) {
		const provider = await this.Provider.findById(pid);
		this.logger.debug(`Deleting instance id ${id} at ${provider.hostname}`);
		switch(provider.type) {
			case ProviderType.ClusterNode:
				return this.deleteKubernetesInstance(provider, id);
		}
	}


	async deleteKubernetesInstance(provider: Provider, id: string) {
		try {
			const kube = await this.getKubeClient(provider);

			await kube.apis.app.v1
				.namespaces(provider.metadata.namespace).deployments(`tf2-${id}`).delete();

			provider.inUse = provider.inUse.filter(e => e.id !== id);
			provider.save();
		} catch (error) {
			this.logger.error("Failed to delete kubernetes instance", error);
		}
	}

	/**
	 * Create a new kube client for the provider or fetch from cache
	 * 
	 * @param provider Provider
	 */
	async getKubeClient(provider: Provider) {
		if (this.kubes[provider.id]) return this.kubes[provider.id];

		const kubeconfig = new KubeConfig()
		kubeconfig.loadFromString(provider.metadata.kubeconfig)
		const backend = new Request({ kubeconfig })
		const kube = new ApiClient.Client1_13({ backend, version: '1.13' });

		this.kubes[provider.id] = kube;

		return this.kubes[provider.id];
	}

	/**
	 * Get free server game port
	 */
	async getFreePort(provider: Provider) {    
		const inUsePorts: number[] = provider.inUse.map(e => e.port);
		const port = this.getRandomPort();
	
		if (inUsePorts.includes(port)) 
			return this.getFreePort(provider);

		return port;
	}

	/**
	 * Get a random port
	 */
	getRandomPort() {
		return ((Math.floor(((Math.random() * (config.ports.max - config.ports.min) + config.ports.min)) / 2))* 2);
	}
}