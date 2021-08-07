import { Client } from '../clients/client.model';
import { BadRequestException, ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server } from './server.model';
import { ServerStatus } from '../../objects/server-status.enum';
import { ProviderService } from '../provider/provider.service';
import { GamesService } from '../games/games.service';
import { ProviderType } from '../provider/provider.model';
import { KubeData } from '../provider/provider-handlers/kubernentes.class';
import { query } from 'gamedig';
import { Game } from '../../objects/game.enum';
import { renderString } from '../../string.util';
import axios from 'axios';
import * as crypto from 'crypto';
import * as ApiClient from 'kubernetes-client';
import * as config from '../../../config.json';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ServerRequestOptions {
  // Game to use while deploying
  game: Game

  // Region of the server
  region: string

  // URL to send a POST request when status of the request changes
  callbackUrl: string

  // ID of a provider that will handle the request
  provider: string

  // Passwords for server
  password?: string
  rconPassword?: string

  // Preferences for closing server
  closePref?: {
    minPlayers: number
    idleTime: number
    waitTime: number
  }

  // Custom data
  data?: {
    // Repository info
    git_repository?: string
    git_deploy_key?: string
  } & { any }
}

export const SERVER_ACTIVE_STATUS_CONDITION = [
  { status: ServerStatus.INIT },
  { status: ServerStatus.ALLOCATING },
  { status: ServerStatus.WAITING },
  { status: ServerStatus.IDLE },
  { status: ServerStatus.RUNNING },
  { status: ServerStatus.CLOSING },
  { status: ServerStatus.DEALLOCATING }
]

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { KubeConfig } = require('kubernetes-client')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Request = require('kubernetes-client/backends/request')

export class ServersService {
  private readonly logger = new Logger(ServersService.name);
  private readonly kube: ApiClient.ApiRoot;

  constructor(
    @InjectModel(Server.name) private repository: Model<Server>,
    private readonly providerService: ProviderService,
    private readonly gameService: GamesService
  ) {
    const kubeconfig = new KubeConfig()
    kubeconfig.loadFromString(config.kube_config)
    const backend = new Request({ kubeconfig })
    this.kube = new ApiClient.Client1_13({ backend, version: '1.13' });

    if (process.env.LIGHTHOUSE_OPERATION_MODE === "manager" && config.monitoring.enabled === true) {
      setInterval(async () => {
        await this.monitor();
      }, config.monitoring.interval * 1000)
    }
  }

  /**
   * Get server by id
   *
   * @param id - Server ID
   */
  async getById(id: string): Promise<Server> {
    let server;

    try {
      server = await this.repository.findById(id);
    } catch (exception) {
      throw new NotFoundException();
    }

    if (!server)
      throw new NotFoundException();

    return server;
  }

  /**
   * Get server by id from specific client
   *
   * @param client
   * @param id - Server ID
   */
  async getByIdForClient(client: Client, id: string): Promise<Server> {
    let server;

    try {
      server = await this.repository.findById(id);
    } catch (exception) {
      throw new NotFoundException();
    }

    if (!server)
      throw new NotFoundException();

    if (client.id !== server.client)
      throw new NotFoundException();

    return server;
  }

  /**
   * Get active servers
   *
   * @param client
   */
  async getActiveServersByClient(client: Client): Promise<Server[]> {
    return this.repository.find({ client: client.id, $or: SERVER_ACTIVE_STATUS_CONDITION });
  }

  /**
   * Get active servers
   */
  async getActiveServers(): Promise<Server[]> {
    return this.repository.find({ $or: SERVER_ACTIVE_STATUS_CONDITION });
  }


  /**
   * Get all active servers for a specific provider
   *
   * @param providerId
   */
  async getActiveServersForProvider(providerId: string): Promise<Server[]> {
    return this.repository.find(
      { provider: providerId, $or: SERVER_ACTIVE_STATUS_CONDITION});
  }

  /**
   * Get all servers
   *
   * @param client
   */
  async getAllServersByClient(client: Client): Promise<Server[]> {
    return this.repository.find({ client: client.id }).limit(50);
  }


  /**
   * Get all servers
   */
  async getAllServers(): Promise<Server[]> {
    return this.repository.find({}).limit(50);
  }

  /**
   * Create a request for new server
   *
   * @param client
   * @param options - Options for server
   */
  async createRequest(client: Client, options: ServerRequestOptions): Promise<Server> {
    const { game, region, callbackUrl } = options;

    this.logger.log(`Received new server request from client '${client.id}' at region '${region}' for game '${game}'`);

    // Check if client can have the required wait timer
    if (options.closePref && options.closePref.waitTime > client.getWaitTimerLimit())
      throw new ForbiddenException(`Requested wait time limit is too high`)

    // Check if client can have the required close timer
    if (options.closePref && options.closePref.idleTime > client.getCloseTimerLimit())
      throw new ForbiddenException(`Requested close time limit is too high`)

    // Verify min players
    if (options.closePref && options.closePref.minPlayers < 1)
      throw new ForbiddenException(`Requested minimum player is too low`)

    // Check if the client has access to the game
    if (!client.hasGameAccess(game))
      throw new ForbiddenException(`Client does not have access to '${game}' game.`)

    // Check if client has access to the region
    if (!client.hasRegionAccess(region))
      throw new ForbiddenException(`Client does not have access to '${region}' region.`)

    // Fetch all servers inuse by the client
    const clientServers = await this.repository.find(
      { client: client.id, $or: SERVER_ACTIVE_STATUS_CONDITION })

    // Check if client has not reached limit
    if (clientServers.length >= client.getLimit())
      throw new HttpException(
        `Cannot create new server as client has reached the limit.`, 429);

    // Fetch all servers inuse by the client in the region
    const clientRegionServers = await this.repository.find(
      { region, client: client.id, $or: SERVER_ACTIVE_STATUS_CONDITION })

    // Check if client has not reached limit for the region
    if (clientRegionServers.length >= client.getRegionLimit(region))
      throw new HttpException(
        `Cannot create new server in '${region}' region as client has reached the limit.`, 429);

    // Fetch the provider
    const provider = await this.providerService.get(options.provider);
    if (!provider)
      throw new BadRequestException("Invalid provider");

    // Check if the client can access the provider
    if (!client.hasProviderAccess(provider.id))
      throw new ForbiddenException("Client does not have access to the provider");

    // Check if provider can handle the request
    const servers = await this.repository.find({ provider: provider.id, $or: SERVER_ACTIVE_STATUS_CONDITION });
    if (provider.limit !== -1 && servers.length >= provider.limit)
      throw new HttpException("Selected provider cannot handle this request currently", 429);

    // Create a server object
    const server = new this.repository({
      client: client.id,
      provider: provider.id,
      callbackUrl, region, game
    });
    server.createdAt = new Date();
    server.status = ServerStatus.INIT;
    server.password = options.password;
    server.rconPassword = options.rconPassword;
    server.data = options.data;
    server.closePref = {
      minPlayers: options.closePref.minPlayers || 2,
      idleTime: options.closePref.idleTime || 900,
      waitTime: options.closePref.waitTime || 300
    }
    await server.save()

    // Process the newly created request
    setTimeout(() => {
      this.createJob(server, "create")
    }, 100);

    return server;
  }

  /**
   * Close a request
   *
   * @param client
   * @param id - ID of the server
   */
  async closeRequest(client: Client, id: string): Promise<void> {
    const server = await this.repository.findById(id);

    if (!server)
      throw new NotFoundException();

    if (client.id !== server.client)
      throw new NotFoundException();

    if (server.status === ServerStatus.CLOSED)
      throw new HttpException("Server has been already closed", 450)

    if (server.status === ServerStatus.CLOSING || server.status === ServerStatus.DEALLOCATING)
      throw new BadRequestException("Server is closing")

    if (!server.closeAt) {
      server.closeAt = new Date();
    }

    await this.updateStatusAndNotify(server, ServerStatus.CLOSING);

    // Process the close request
    setTimeout(() => {
      this.createJob(server, "destroy")
    }, 100);
  }


  /**
   * Create a kubernetes job that will process the request
   *
   * @param server
   * @param action
   */
  async createJob(server: Server, action: string): Promise<void> {
    try {
      const jobName = `lighthouse-provider-${server._id}-${action}`
      const contents = renderString(
        fs.readFileSync(
          path.resolve(__dirname + '/../../../assets/provider_job.yaml')
        ).toString(), {
          id: server._id,
          action,
          label: config.label,
          config_name: process.env.LIGHTHOUSE_PROVIDER_CONFIG_NAME,
          image: process.env.LIGHTHOUSE_PROVIDER_IMAGE
        });

      try {
        await this.kube.apis.batch.v1
          .namespace(process.env.LIGHTHOUSE_PROVIDER_NAMESPACE)
          .job(jobName).get()

        this.logger.log(`Job with name '${jobName}' already exists, skipping creation`);
      } catch (error) {
        if (error.statusCode === 404) {
          await this.kube.apis.batch.v1
            .namespace(process.env.LIGHTHOUSE_PROVIDER_NAMESPACE)
            .jobs.post({ body: yaml.load(contents) });

          this.logger.log(`Created job for action ${action} for server ${server._id}`);
        } else {
          throw error
        }
      }
    } catch (exception) {
      this.logger.error(`Failed to create job for handling the provider request ${exception}`, exception.stack);
      await this.updateStatusAndNotify(server, ServerStatus.FAILED);
    }
  }

  /**
   * Process a request
   *
   * @param server
   */
  async processRequest(server: Server): Promise<boolean> {
    this.logger.log(`Current status of the server ${server._id} is ${server.status}`)

    if (server.status === ServerStatus.INIT) {
      try {
        await this.initializeServer(server);
      } catch (exception) {
        this.logger.error(`Failed to initialize server ${exception}`, exception.stack);
        await this.updateStatusAndNotify(server, ServerStatus.FAILED);
        return false;
      }
    } else if (server.status === ServerStatus.CLOSING) {
      try {
        await this.closeServer(server);
      } catch (exception) {
        this.logger.error(`Failed to close server ${exception}`, exception.stack);
        await this.updateStatusAndNotify(server, ServerStatus.FAILED);
        return false;
      }
    } else {
      this.logger.error(`Server (${server._id}) is in wrong state ${server.status} to be processed.`);
      await this.updateStatusAndNotify(server, ServerStatus.FAILED);
      return false;
    }

    return true;
  }

  /**
   * Start a new server
   *
   * @param server
   */
  async initializeServer(server: Server): Promise<void> {
    if (!server.password)
      server.password = crypto.randomBytes(4).toString("hex");

    if (!server.rconPassword)
      server.rconPassword = crypto.randomBytes(4).toString("hex");

    await this.updateStatusAndNotify(server, ServerStatus.ALLOCATING);

    const provider = await this.providerService.get(server.provider);
    const game = await this.gameService.getBySlug(server.game);
    let data;

    // Fetch inuse ports for kubernetes provider
    if (provider.type === ProviderType.KubernetesNode) {
      const kubeData: KubeData = { inUsePorts: [] };
      const servers = await this.repository.find(
        { provider: provider.id, $or: SERVER_ACTIVE_STATUS_CONDITION});
      kubeData.inUsePorts = servers.map(server => server.port);
      data = kubeData;
    }

    const allocatedServer = await this.providerService.createInstance(provider, server, game, data);
    await this.updateStatusAndNotify(server, ServerStatus.WAITING);
    await this.setCloseTime(server, server.closePref.waitTime);

    this.logger.log(`Server created ${allocatedServer.id}, (${allocatedServer.ip}:${allocatedServer.port} ${allocatedServer.password} ${allocatedServer.rconPassword})`);
  }

  /**
   * Close a server
   *
   * @param server
   */
  async closeServer(server: Server): Promise<void> {
    this.logger.log(`Closing server ${server.id}`);

    await this.updateStatusAndNotify(server, ServerStatus.DEALLOCATING);

    const game = await this.gameService.getBySlug(server.game);
    const provider = await this.providerService.get(server.provider);
    await this.providerService.deleteInstance(provider, server, game);

    await this.updateStatusAndNotify(server, ServerStatus.CLOSED);

    this.logger.log(`Server closed ${server.id}`);
  }

  /**
   * Check all servers if they are active or idle
   */
  async monitor(): Promise<void> {
    // Check for first heartbeat from waiting servers
    const waitingServers = await this.repository.find({
      status: ServerStatus.WAITING
    });
    for (const server of waitingServers) {
      setTimeout(async () => await this.checkForHeartbeat(server), 100);
    }

    // Check for enough players in active servers
    const activeServers = await this.repository.find({ $or: [
        { status: ServerStatus.UNKNOWN },
        { status: ServerStatus.IDLE },
        { status: ServerStatus.RUNNING }
      ]
    });
    this.logger.debug(`Found ${activeServers.length} running servers...`)
    for (const server of activeServers) {
      setTimeout(async () => await this.checkForMinimumPlayers(server), 100);
    }

    // Check for close times in idle servers
    const idleServers = await this.repository.find({ $or: [
        { status: ServerStatus.UNKNOWN },
        { status: ServerStatus.IDLE },
        { status: ServerStatus.WAITING }
      ]
    });
    for (const server of idleServers) {
      const current = new Date();
      const close = server.closeAt;

      if (current > close) {
        await this.updateStatusAndNotify(server, ServerStatus.CLOSING);

        // Process the close request
        setTimeout(() => {
          this.createJob(server, "destroy")
        }, 100);
      }
    }
  }

  /**
   * Check if the server is live
   *
   * @param server
   */
  async checkForHeartbeat(server: Server): Promise<void> {
    try {
      const game = await this.gameService.getBySlug(server.game);
      await query({
        host: server.ip,
        port: server.port,
        type: game.data.queryType
      });

      this.logger.log(`Received first heartbeat for server ${server.id}`);
      await this.updateStatusAndNotify(server, ServerStatus.IDLE);
      await this.setCloseTime(server, 0);
    } catch (exception) {
      this.logger.debug(`Failed to query server ${server.id} (${server.ip}:${server.port}) due to ${exception}`);
      await this.setCloseTime(server, server.closePref.idleTime);
    }
  }

  /**
   * Check if the server has minimum players
   *
   * @param server
   */
  async checkForMinimumPlayers(server: Server): Promise<void> {
    try {
      const game = await this.gameService.getBySlug(server.game);
      const data = await query({
        host: server.ip,
        port: server.port,
        type: game.data.queryType
      });

      this.logger.debug(`Pinged ${server.id} [${server.game}] (${server.ip}:${server.port}) server, ${data.players.length} playing, current status ${server.status}`);

      if (data.players.length < server.closePref.minPlayers) {
        await this.updateStatusAndNotify(server, ServerStatus.IDLE);
        await this.setCloseTime(server, server.closePref.idleTime);
      } else {
        await this.updateStatusAndNotify(server, ServerStatus.RUNNING);
        await this.setCloseTime(server, 0);
      }
    } catch (exception) {
      await this.updateStatusAndNotify(server, ServerStatus.UNKNOWN);
      this.logger.debug(`Failed to query server ${server.id} (${server.ip}:${server.port}) due to ${exception}`);
      await this.setCloseTime(server, server.closePref.idleTime);
    }
  }

  /**
   * Update the status of a server and notify the callback url if it is present
   *
   * @param server
   * @param status
   * @param data
   */
  async updateStatusAndNotify(server: Server, status: ServerStatus, data: any = {}): Promise<void> {
    if (server.status === status) return;

    server.status = status;

    if (server.callbackUrl) {
      this.logger.log(`Notifying URL '${server.callbackUrl}' for status '${server.status} (${server._id})'`);

      try {
        await axios.post(`${server.callbackUrl}?status=${server.status}`, { ...server.toJSON(), ...data })
      } catch (error) {
        if (error.code === "ECONNREFUSED") {
          this.logger.warn(`Failed to connect callback URL "${server.callbackUrl}"`);
        } else {
          this.logger.error("Failed to notify callback URL", error)
        }
      }
    }

    await server.save()
  }

  /**
   * Set the close time for the server
   * If the seconds param is less than or equal to 0 then the close time is removed
   *
   * @param server
   * @param seconds
   */
  async setCloseTime(server: Server, seconds: number): Promise<void> {
    if ([ ServerStatus.CLOSING, ServerStatus.CLOSED, ServerStatus.DEALLOCATING ].includes(server.status)) return;

    if (seconds > 0) {
      if (server.closeAt) return;

      const current = new Date();
      current.setSeconds(current.getSeconds() + seconds);
      server.closeAt = current
      this.logger.log(`Assigned closeAt time for ${server.id} at ${server.closeAt}`);
    } else {
      if (!server.closeAt) return;

      server.closeAt = undefined;
      this.logger.log(`Removed closeAt time for ${server.id}`);
    }

    await server.save()
  }
}