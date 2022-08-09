import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Provider, ProviderType } from './provider.model';
import {
  KubeData,
  KubernetesHandler,
} from './provider-handlers/kubernentes.class';
import { GCloudHandler } from './provider-handlers/gcloud.class';
import { AzureHandler } from './provider-handlers/azure.class';
import { DigitalOceanHandler } from './provider-handlers/digitalocean.class';
import { VultrHandler } from './provider-handlers/vultr.class';
import { Server } from '../servers/server.model';
import { Game } from '../games/game.model';
import { Client } from '../clients/client.model';
import { BinaryLaneHandler } from './provider-handlers/binarylane.class';
import { LinodeHandler } from './provider-handlers/linode.class';
import { AWSHandler } from './provider-handlers/aws.class';
import { OneqodeHandler } from './provider-handlers/oneqode.class';
import { Span } from '@opentelemetry/api';

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(
    @InjectModel(Provider.name) private repository: Model<Provider>,
  ) {}

  /**
   * Get all providers that handle a region
   *
   * @param region - Region to use for selecting provider
   */
  async getByRegion(region: string): Promise<Provider[]> {
    return this.repository.find({ region }).sort({ priority: -1 });
  }

  /**
   * Get all the available providers that can handle the region
   *
   * @param client
   * @param region - Region to use for selecting provider
   * */
  async available(client: Client, region: string): Promise<string[]> {
    if (!client.hasRegionAccess(region))
      throw new UnauthorizedException(
        'Client does not have access to this region',
      );

    // Fetch providers that can handle the requested region
    const providers = await this.getByRegion(region);
    const available = [];

    // Check if a provider can handle the request
    for (const provider of providers) {
      const providerServers = await this.repository.find({
        provider: provider.id,
      });

      if (
        providerServers.length < provider.limit &&
        client.hasProviderAccess(provider.id)
      ) {
        available.push(provider);
      }
    }

    return available.map(providers => providers.id);
  }

  /**
   * Create a new instance
   *
   * @param provider
   * @param server
   * @param game
   * @param span
   * @param data - Custom data to use by providers
   * */
  async createInstance(
    provider: Provider,
    server: Server,
    game: Game,
    span: Span,
    data?: KubeData,
  ): Promise<any> {
    span.addEvent('serverCreateInstance', {
      server: server.id,
      provider: provider.id,
      'provider.type': provider.type,
    });
    this.logger.debug(
      `Creating resources for server '${server.id}' using provider '${provider.id}' for game '${game.name}'`,
    );

    switch (provider.type) {
      case ProviderType.KubernetesNode:
        return new KubernetesHandler(provider, game, data).createInstance(
          server,
          span,
        );
      case ProviderType.GCloud:
        return new GCloudHandler(provider, game).createInstance(server, span);
      case ProviderType.AWS:
        return new AWSHandler(provider, game).createInstance(server);
      case ProviderType.Azure:
        return new AzureHandler(provider, game).createInstance(server);
      case ProviderType.DigitalOcean:
        return new DigitalOceanHandler(provider, game).createInstance(server);
      case ProviderType.Vultr:
        return new VultrHandler(provider, game).createInstance(server);
      case ProviderType.BinaryLane:
        return new BinaryLaneHandler(provider, game).createInstance(server);
      case ProviderType.Linode:
        return new LinodeHandler(provider, game).createInstance(server);
      case ProviderType.Oneqode:
        return new OneqodeHandler(provider, game).createInstance(server);
    }
  }

  /**
   * Destroy an instance
   *
   * @param provider
   * @param server
   * @param game
   * @param span
   * */
  async deleteInstance(
    provider: Provider,
    server: Server,
    game: Game,
    span: Span,
  ): Promise<void> {
    span.addEvent('serverDestroyInstance', {
      server: server.id,
      provider: provider.id,
      'provider.type': provider.type,
    });
    this.logger.debug(`Deleting instance id ${server.id} at ${provider.id}`);
    switch (provider.type) {
      case ProviderType.KubernetesNode:
        return new KubernetesHandler(provider, game, null).destroyInstance(
          server,
          span,
        );
      case ProviderType.GCloud:
        return new GCloudHandler(provider, game).destroyInstance(server, span);
      case ProviderType.AWS:
        return new AWSHandler(provider, game).destroyInstance(server);
      case ProviderType.Azure:
        return new AzureHandler(provider, game).destroyInstance(server);
      case ProviderType.DigitalOcean:
        return new DigitalOceanHandler(provider, game).destroyInstance(server);
      case ProviderType.Vultr:
        return new VultrHandler(provider, game).destroyInstance(server);
      case ProviderType.BinaryLane:
        return new BinaryLaneHandler(provider, game).destroyInstance(server);
      case ProviderType.Linode:
        return new LinodeHandler(provider, game).destroyInstance(server);
      case ProviderType.Oneqode:
        return new OneqodeHandler(provider, game).destroyInstance(server);
    }
  }

  async get(id: string): Promise<Provider> {
    return this.repository.findById(id);
  }
}
