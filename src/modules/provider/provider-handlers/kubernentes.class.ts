import { Handler } from '../handler.class';
import { Provider } from '../provider.model';
import * as yaml from 'js-yaml';
import * as ApiClient from 'kubernetes-client';
import { Game } from '../../games/game.model';
import { Server } from '../../servers/server.model';
import { GameArgsOptions as Tf2Options, Tf2Chart } from '../../games/charts/tf2.chart';
import { GameArgsOptions as ValheimOptions, ValheimChart } from '../../games/charts/valheim.chart';
import { Game as GameEnum } from '../../../objects/game.enum';

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
			let data;

			const port = await this.getFreePort();
			options.ip = this.provider.metadata.kubeIp;
			options.port = port

			switch (options.game) {
				case GameEnum.TF2_COMP:
					options.tvPort = port + 1
					data = Tf2Chart.getDataObject(options, {
						tvEnable: true,
						image: this.provider.metadata.image,
						hostname: this.provider.metadata.kubeHostname
					}) as Tf2Options
					break
				case GameEnum.VALHEIM:
					data = ValheimChart.getDataObject(options, {
						port: options.port,
						image: this.provider.metadata.image,
						hostname: this.provider.metadata.kubeHostname
					}) as ValheimOptions
					break
			}

			if (options.game === "tf2-comp") {
				data.tv.enabled  = true
				data.tv.port = data.port + 1
				data.tv.name = "QixTV"
			}

			this.logger.debug(`Assigned address for id ${options.id} ${this.provider.metadata.kubeIp}:${port}`);

			let chart;
			if (options.game === GameEnum.TF2_COMP) {
				chart = Tf2Chart.renderDeployment(data);
			} else if (options.game === GameEnum.VALHEIM) {
				chart = ValheimChart.renderDeployment(data);
			}

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
		return ((Math.floor(((Math.random() * (
			this.provider.metadata.kubePorts.max - this.provider.metadata.kubePorts.min) + this.provider.metadata.kubePorts.min)) / 2))* 2);
	}
}