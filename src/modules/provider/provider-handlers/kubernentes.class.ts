import { Handler } from "../handler.class";
import { Provider } from "../provider.model";
import * as yaml from "js-yaml";
import * as ApiClient from 'kubernetes-client';
import { ServerChart } from '../../servers/server.chart';
import * as config from "../../../../config.json"
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { KubeConfig } = require('kubernetes-client')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Request = require('kubernetes-client/backends/request')
const kubes = {};

export interface KubeData {
	inUsePorts: number[]
}

export class KubernetesHandler extends Handler {	
	kube: ApiClient.ApiRoot;
	namespace: string
	private data: KubeData;

	constructor(provider: Provider, game: Game, data: KubeData) {
		super(provider);

		provider.metadata = { ...provider.metadata, ...game.data.providerOverrides.kubernetes };

		this.data = data;
		this.namespace = provider.metadata.kubeNamespace;

		if (kubes[provider._id]) 
			this.kube = kubes[provider._id];
		else {
			const kubeconfig = new KubeConfig()
			kubeconfig.loadFromString(provider.metadata.kubeConfig)
			const backend = new Request({ kubeconfig })
			const kube = new ApiClient.Client1_13({ backend, version: '1.13' });
	
			kubes[provider.id] = kube;
	
			this.kube = kubes[provider._id];
		}
	}

	async createInstance(options: Server): Promise<Server> {
		try {
			const port = await this.getFreePort();
			options.port = port;
			options.ip = this.provider.metadata.kubeIp;
			options.tvPort = port + 1;

			const data = {
				...options.toJSON(),
				id: options.id,
				image: this.provider.metadata.image,
				hostname: this.provider.metadata.kubeHostname,
				tv: {
					enabled: true,
					port: port + 1,
					name: config.instance.tv_name
				}
			}

			this.logger.debug(`Assigned address for id ${options.id} ${this.provider.metadata.kubeIp}:${port}`);
	
			const chart = ServerChart.render(data);
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments.post({ body: yaml.load(chart) });

			return options;
		} catch (error) {
			this.logger.error("Failed to create kubernetes instance", error);
		}
	}

	async destroyInstance(server: Server): Promise<void> {
		try {
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments(`tf2-${server._id}`).delete();
		} catch (error) {
			this.logger.error("Failed to delete kubernetes instance", error);
		}
	}

	/**
	 * Get free server game port
	 */
	async getFreePort(): Promise<number> {
		const inUsePorts = this.data.inUsePorts;
		const port = this.getRandomPort();

		if (inUsePorts.includes(port))
			return this.getFreePort();

		return port;
	}

	/**
	 * Get a random port
	 */
	getRandomPort() {
		return ((Math.floor(((Math.random() * (
			this.provider.metadata.kubePorts.max - this.provider.metadata.kubePorts.min) + this.provider.metadata.kubePorts.min)) / 2))* 2);
	}
}