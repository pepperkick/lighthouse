import { Injectable, BadRequestException, ConflictException, NotFoundException, HttpException, HttpService, HttpStatus, Logger } from '@nestjs/common';
import { BookingDTO } from './dto/booking.dto';
import { BookingStatusDTO } from './dto/booking-status.dto';
import { PostBookDTO } from './dto/post-book.dto';
import { query } from "gamedig";
import * as ApiClient from 'kubernetes-client';
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as crypto from "crypto";
import * as config from "../../../config.json"
import { decode } from 'punycode';

const tokens = config.tokens;
const IP = config.ip;
const APP_LABEL = config.label;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly kube = new ApiClient.Client1_13({ version: '1.13' });
  private timers = {};

  constructor() {
    this.monitorServers();
  }

  /**
   * Get status of all tf2 deployment
   */
  async bookStatus(): Promise<BookingStatusDTO> {
    const deps = await this.getDeploymentsByApp();
    const inUse = deps.body.items.length;
    const bookings: BookingDTO[] = deps.body.items.map((e): BookingDTO => ({
      id: e.metadata.labels[`${APP_LABEL}/bookedBy`],
      password: e.metadata.labels[`${APP_LABEL}/gamePassword`],
      rconPassword: e.metadata.labels[`${APP_LABEL}/rconPassword`],
      port: e.metadata.labels[`${APP_LABEL}/gamePort`],
      tvPort: e.metadata.labels[`${APP_LABEL}/tvPort`],
      token: e.metadata.labels[`${APP_LABEL}/token`],
      ip: IP
    }));
    
    return {
      limit: config.limit,
      inUse, bookings
    }
  }

  /**
   * Create a new tf2 deployment
   * 
   * @param data PostBookDTO 
   */
  async bookServer(data: PostBookDTO): Promise<BookingDTO> {
    await this.checkForLimits();
    await this.checkHasBooking(data.id);

    const password = crypto.randomBytes(4).toString('hex')
    const rconPassword = crypto.randomBytes(4).toString('hex')
    const token = await this.getFreeServerToken();
    const port = await this.getFreeServerPort();
    const ip = IP;
    const renderData = {
      label: APP_LABEL,
      id: data.id,
      map: "cp_badlands",
      gameServerToken: token,
      imageName: config.instance.image.name,
      imageTag: config.instance.image.tag,
      gamePort: port,
      tvPort: port + 1,
      tvName:  config.instance.tv_name,
      ip, password, rconPassword,
      extraArguments: `+hostname ${config.instance.hostname} -condebug`
    }
      
    const deployment = this.renderString(fs.readFileSync(__dirname + '/../../../assets/deployment.yaml').toString(), renderData);
    await this.kube.apis.app.v1
      .namespaces(config.namespace).deployments.post({ body: yaml.load(deployment) });
  
    this.logger.log(`Server booked by ${data.id}, (${ip} ${port} ${password} ${rconPassword})`);

    return {
      id: data.id,
      region: "",
      connectString: `connect ${ip}:${port}; password ${password}; rcon_password ${rconPassword}`,
      tvPort: port + 1,
      ip, port, password, rconPassword
    };
  }
  
  /**
   * Remove user's tf2 deployment
   * 
   * @param id Booking ID
   */
  async unbookServer(id: string): Promise<void> {
    const deps = await this.kube.apis.app.v1
      .namespaces(config.namespace).deployments.get({
      qs: {
        labelSelector: `${APP_LABEL}/bookedBy=${id}`
      }
    });

    if (deps.body.items.length === 0)
      throw new NotFoundException(`No booking with id ${id} found`);

    await this.kube.apis.app.v1
      .namespaces(config.namespace).deployments(`tf2-${id}`).delete();
  
    // Clear unbook timer if any
    if (this.timers[id]) {
      clearTimeout(this.timers[id]);
      delete this.timers[id];
    }

    this.logger.log(`Server unbooked by ${id}`);
  }

  /**
   * Render a string by filling templates with values
   * 
   * Example: 
   *  params
   *   str: tf2-{{ name }}
   *   data: { "name": "test" }
   *  return
   *   tf2-test
   * 
   * @param str String to do rendering in
   * @param data Data to use while rendering
   */
  renderString(str: string, data = {}) {
    for (let key in data) {
      if (data.hasOwnProperty(key)) {
        str = str.replace(new RegExp(`{{ ${key} }}`, "g"), data[key]);
      }
    }

    return str;
  }

  /**
   * Get all tf2 deployments
   */
  async getDeploymentsByApp() {
    return this.kube.apis.app.v1
      .namespaces(config.namespace).deployments.get({
      qs: {
        labelSelector: `app=tf2`
      }
    });
  }

  /**
   * Get all tf2 deployments by booker
   * 
   * @param discordId Booker's discord id
   */
  async getDeploymentsByBooker(discordId: string) {
    return this.kube.apis.app.v1
      .namespaces(config.namespace).deployments.get({
      qs: {
        labelSelector: `${APP_LABEL}/bookedBy=${discordId}`
      }
    });
  }

  /**
   * Get free server token
   */
  async getFreeServerToken() {
    const deps = await this.getDeploymentsByApp();

    const inUseTokens = deps.body.items.map(e => e.metadata.labels[`${APP_LABEL}/token`]);
    const freeTokens = tokens.filter(e => !inUseTokens.includes(e));
  
    if (freeTokens.length === 0) 
      throw new HttpException(`Reached limit`, HttpStatus.TOO_MANY_REQUESTS);

    return freeTokens[Math.floor(Math.random() * freeTokens.length)];
  }

  /**
   * Get free server game port
   */
  async getFreeServerPort() {
    const deps = await this.getDeploymentsByApp();
    
    const inUsePorts: number[] = deps.body.items.map(e => e.metadata.labels[`${APP_LABEL}/gamePort`]);
    const port = this.getRandomPort();
  
    if (inUsePorts.includes(port)) 
      return this.getFreeServerPort();

    return port;
  }

  /**
   * Get a random port
   */
  getRandomPort() {
    return ((Math.floor(((Math.random() * (config.ports.max - config.ports.min) + config.ports.min)) / 2))* 2);
  }

  /**
   * Check if there are too many deployments already
   */
  async checkForLimits() {    
    const deps = await this.getDeploymentsByApp();

    if (deps.body.items.length === config.limit)
      throw new HttpException(`Reached limit`, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Check if there is already a deployment with the id
   * 
   * @param discordId Booker's discord id
   */
  async checkHasBooking(discordId: string) {
    const deps = await this.getDeploymentsByBooker(discordId);

    if (deps.body.items.length !== 0)
      throw new ConflictException(`A server with id ${discordId} is already running`);
  }

  /**
   * Monitor game server for number of players
   * If there are no players then mark the server as inactive
   * If there are players then mark the server as active
   */
  monitorServers() {
    setInterval(async () => {
      this.logger.debug("Pinging servers");
      try {         
        const deps = await this.getDeploymentsByApp();
        const bookers = deps.body.items.map(e => e.metadata.labels[`${APP_LABEL}/bookedBy`]);
        this.logger.debug(`Found ${bookers.length} bookings`);
    
        for (let booker of bookers) {
          const deployment = await this.getDeploymentsByBooker(booker);
          const port = parseInt(deployment.body.items[0].metadata.labels[`${APP_LABEL}/gamePort`]);

          try {
            const data = await query({
              host: IP, port,
              type: "tf2"
            });
    
            this.logger.debug(`Pinged ${IP}:${port} server, ${data.players.length} playing`);
            if (data.players.length == 0) {
              if (!this.timers[booker]) {
                this.timers[booker] = setTimeout(() => this.unbookServer(booker), config.waitPeriod * 1000);
                this.logger.log(`Marked server booked by ${booker} for closure in next ${config.waitPeriod} seconds`);
              }
            } else {
              if (this.timers[booker]) {
                clearTimeout(this.timers[booker]);
                this.logger.log(`Unmarked server booked by ${booker} for closure`);
                delete this.timers[booker];
              }
            }
          } catch (error) {
            this.logger.error(`Failed to query server by booker ${booker} (${IP}:${port}) due to ${error}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to monitor servers due to ${error}`);
      }
    }, 5 * 1000);
  }
}
