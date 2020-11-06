import { Injectable, Logger, forwardRef, Inject } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Provider, ProviderType } from "./provider.model";
import { InstanceOptions } from "./handler.class";
import { KubernetesHandler } from "./provider-handlers/kubernentes.class";
import { GCloudHandler } from "./provider-handlers/gcloud.class";
import { BookingService } from "../booking/booking.service";
import { VultrHandler } from "./provider-handlers/vultr.class";

@Injectable()
export class ProviderService {
	private readonly logger = new Logger(ProviderService.name);

	constructor(
		@InjectModel(Provider.name) private Provider: Model<Provider>,
    @Inject(forwardRef(() => BookingService))
		private bookingService: BookingService
	) {}

	/**
	 * Find a free provider based on selectors provided 
	 * 
	 * @param selectors Selectors to use while searching for provider
	 */
	async find(selectors: object): Promise<Provider | undefined> {
		const providers = await this.Provider
			.find({ $and: [ { selectors } ] })
			.sort({ priority: -1 });

		for (let provider of providers) {
			const limit = provider.limit;
			const inUse = await (await this.bookingService.getInUseBookingsForProvider(provider)).length;

			if (limit > inUse) return provider;
		}

		return;
	}

	async status(queryHidden = false) {
		const providers = await this.Provider.find().sort({ name: 1 });
		const data = [];

		for (let provider of providers) {
			if (!queryHidden && provider.metadata.hidden === true) continue;
			const inUse = await (await this.bookingService.getInUseBookingsForProvider(provider)).length;

			switch (provider.type) {
				case ProviderType.KubernetesNode:
					data.push({
						id: provider.id,
						limit: provider.limit,
						inUse,
						name: provider.name,
						hostname: provider.metadata.hostname,
						ip: provider.metadata.ip,
						...provider.selectors
					});
					break;
				case ProviderType.GCloud:
					data.push({
						id: provider.id,
						limit: provider.limit,
						inUse,
						name: provider.name,
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
				return new KubernetesHandler(provider, this.bookingService).createInstance(options);
			case ProviderType.GCloud:
				return new GCloudHandler(provider, this.bookingService).createInstance(options);
			case ProviderType.Vultr:
				return new VultrHandler(provider, this.bookingService).createInstance(options);
		}
	}

	async deleteInstance(pid: string, id: string) {
		const provider = await this.Provider.findById(pid);
		this.logger.debug(`Deleting instance id ${id} at ${provider.name}`);
		switch(provider.type) {
			case ProviderType.KubernetesNode:
				return new KubernetesHandler(provider, this.bookingService).destroyInstance(id);
			case ProviderType.GCloud:
				return new GCloudHandler(provider, this.bookingService).destroyInstance(id);
			case ProviderType.Vultr:
				return new VultrHandler(provider, this.bookingService).destroyInstance(id);
		}
	}

	async get(id: string) {
		return this.Provider.findById(id);
	}
}