import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import * as yaml from 'js-yaml';
import * as ApiClient from 'kubernetes-client';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import { Game as GameEnum } from '../../../objects/game.enum';
import { Tf2Chart } from '../../games/charts/tf2.chart';
import { ValheimChart } from '../../games/charts/valheim.chart';
import { MinecraftChart } from '../../games/charts/minecraft.chart';
import * as config from '../../../../config.json';

const label = config.instance.label
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

	async createInstance(server: Server): Promise<Server> {
		try {
			const hostname = this.provider.metadata.kubeHostname;
			server.image = server.image || this.provider.metadata.image
			server.ip = this.provider.metadata.kubeIp;
			server.port = await this.getFreePort()

			switch (server.game) {
				case GameEnum.TF2:
					server.data.tvPort = server.port + 1
					server.data.hatchAddress = `:${server.port + 2}`
					break
				case GameEnum.VALHEIM:
					break
				case GameEnum.MINECRAFT:
					break
			}

			this.logger.debug(`Assigned address for id ${server.id} ${this.provider.metadata.kubeIp}:${server.port}`);

			let chart;
			if (server.game === GameEnum.TF2) {
				chart = Tf2Chart.renderDeployment(server, hostname, label);
			} else if (server.game === GameEnum.VALHEIM) {
				chart = ValheimChart.renderDeployment(server, hostname, label);
			} else if (server.game === GameEnum.MINECRAFT) {
				chart = MinecraftChart.renderDeployment(server, hostname, label);
			}

			console.log(chart)

			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments.post({ body: yaml.load(chart) });

			return server;
		} catch (error) {
			this.logger.error("Failed to create kubernetes instance", error);
		}
	}

	async destroyInstance(server: Server): Promise<void> {
		try {
			await this.kube.apis.app.v1
				.namespaces(this.namespace).deployments(`${label}-${server._id}`).delete();
		} catch (error) {
			this.logger.error(`Failed to destroy kubernetes instance`, error);
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
	getRandomPort(): number {
		const portGap = 8;
		return ((Math.floor(((Math.random() * (
			this.provider.metadata.kubePorts.max - this.provider.metadata.kubePorts.min) + this.provider.metadata.kubePorts.min)) / portGap)) * portGap);
	}
}