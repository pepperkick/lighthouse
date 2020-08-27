import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Provider, ProviderType } from "./provider.model";
import { InstanceOptions } from "./handler.class";
import { KubernetesHandler } from "./provider-handlers/kubernentes.class";

@Injectable()
export class ProviderService {
	private readonly logger = new Logger(ProviderService.name);

	constructor(@InjectModel(Provider.name) private Provider: Model<Provider>) {}

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
			switch (provider.type) {
				case ProviderType.KubernetesNode:
					data.push({
						id: provider.id,
						limit: provider.limit,
						inUse: provider.inUse.length,
						name: provider.name,
						hostname: provider.metadata.hostname,
						ip: provider.metadata.ip,
						...provider.selectors
					});
					break;
			}
		}

		return data;
	}

	async createInstance(provider: Provider, options: InstanceOptions) {
		this.logger.debug(`Creating instance for id ${options.id} at ${provider.name}`);
		
		switch(provider.type) {
			case ProviderType.KubernetesNode:
				const handler = new KubernetesHandler(provider);
				return handler.createInstance(options);
		}
	}

	async deleteInstance(pid: string, id: string) {
		const provider = await this.Provider.findById(pid);
		this.logger.debug(`Deleting instance id ${id} at ${provider.name}`);
		switch(provider.type) {
			case ProviderType.KubernetesNode:
				const handler = new KubernetesHandler(provider);
				return handler.destroyInstance(id);
		}
	}
}