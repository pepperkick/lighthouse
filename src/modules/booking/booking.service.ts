import { Injectable, BadRequestException, ConflictException, NotFoundException, HttpException, HttpService, HttpStatus, Logger, InternalServerErrorException } from '@nestjs/common';
import { BookingDTO } from './dto/booking.dto';
import { BookingStatusDTO } from './dto/booking-status.dto';
import { PostBookDTO } from './dto/post-book.dto';
import { query } from "gamedig";
import * as ApiClient from 'kubernetes-client';
import * as yaml from "js-yaml";
import * as crypto from "crypto";
import * as config from "../../../config.json"
import { InjectModel } from '@nestjs/mongoose';
import { Booking } from './booking.model';
import { Model } from 'mongoose';
import axios from 'axios';
import { BookingChart } from './booking.chart';
import { v4 as uuid } from 'uuid';
import { GSTokenService } from '../gstoken/gstoken.service';
import { ElasticService } from './elastic.service';

const IP = config.ip;

enum StatusEvent {
  BOOK = 'book',
  UNBOOK = 'unbook'
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly kube = new ApiClient.Client1_13({ version: '1.13' });
  private timers = {};

  constructor(
    @InjectModel(Booking.name) private Booking: Model<Booking>, 
    private elasticService: ElasticService,
    private tokenService: GSTokenService
  ) {
    this.monitorServers();
  }

  /**
   * Get status of all tf2 deployment
   */
  async statusAll(): Promise<BookingStatusDTO> {
    const bookings: BookingDTO[] = await this.Booking.find();
    const inUse = bookings.length;

    return {
      limit: config.limit,
      inUse, bookings
    }
  }

  /**
   * Get booking status by id
   * 
   * @param id Booking ID
   */
  async statusById(id: string): Promise<BookingDTO> {
    return await this.Booking.findById(id);
  }

  /**
   * Create a new tf2 deployment
   * 
   * @param data PostBookDTO 
   */
  async book(data: PostBookDTO): Promise<BookingDTO> {
    await this.checkForLimits();
    await this.checkHasBooking(data.id);

    const token = await (await this.tokenService.reserve()).login_token;
    const port = await this.getFreeServerPort();
    const password = crypto.randomBytes(4).toString('hex')
    const rconPassword = crypto.randomBytes(4).toString('hex')
    const ip = IP;

    try {        
      const booking = new this.Booking();
      booking._id = data.id || uuid();
      booking.id = data.id || uuid();
      booking.password = password;
      booking.rconPassword = rconPassword;
      booking.port = port;
      booking.tvPort = port + 1;
      booking.token = token;
      booking.ip = ip;
      booking.callbackUrl = data.callbackUrl || "";
      booking.metadata = data.metadata;
      await booking.save();
  
      const chart = BookingChart.render({
        id: booking.id,
        image: `${config.instance.image.name}:${config.instance.image.tag}`,
        hostname: config.instance.hostname,
        tv: { port: port + 1, name: config.instance.tv_name },
        password, rconPassword, token, port, ip,
      });
  
      await this.kube.apis.app.v1
        .namespaces(config.namespace).deployments.post({ body: yaml.load(chart) });
    
      await this.notifyViaUrl(booking.callbackUrl, StatusEvent.BOOK);
  
      this.logger.log(`Server booked ${data.id}, (${ip}:${port} ${password} ${rconPassword})`);

      this.elasticService.sendData({
        timestamp: new Date(),
        event: StatusEvent.BOOK,
        ...this.extractDetails(booking)
      });
  
      return booking;
    } catch (error) {
      this.logger.error(`Failed to create booking for id ${data.id}`, error);
      await this.tokenService.release(token);
      throw new InternalServerErrorException("Failed to create booking");
    }
  }
  
  /**
   * Remove user's tf2 deployment
   * 
   * @param id Booking ID
   */
  async unbook(id: string): Promise<void> {
    const booking = await this.Booking.findById(id);

    if (!booking) 
      throw new NotFoundException(`Could not find any booking with ID ${id}`);

    try {
      await this.kube.apis.app.v1
        .namespaces(config.namespace).deployments(`tf2-${id}`).delete();
    } catch (error) {
      if (error.statusCode === 404) {
        this.logger.warn(`Found booking entry for "${id}" but could not find deployment, removing entry.`);
      } else {
        this.logger.error("Unknown error", error)
        throw error;
      }
    } finally {    
      // Clear unbook timer if any
      if (this.timers[id]) {
        clearTimeout(this.timers[id]);
        delete this.timers[id];
      }

      await this.tokenService.release(booking.token);
      
      this.elasticService.sendData({
        timestamp: new Date(),
        event: StatusEvent.UNBOOK,
        ...this.extractDetails(booking)
      });

      await this.Booking.deleteOne({ _id: id });
    }

    await this.notifyViaUrl(booking.callbackUrl, StatusEvent.UNBOOK);

    this.logger.log(`Server unbooked ${id}`);
  }

  /**
   * Get free server game port
   */
  async getFreeServerPort() {
    const bookings = await this.Booking.find();
    
    const inUsePorts: number[] = bookings.map(e => e.port);
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
    const bookings = await this.Booking.find();

    if (bookings.length === config.limit)
      throw new HttpException(`Reached limit`, HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Check if there is already a deployment with the id
   * 
   * @param id Booking ID
   */
  async checkHasBooking(id: string) {
    const booking = await this.Booking.findById(id);

    if (booking)
      throw new ConflictException(`A server with id ${id} is already running`);
  }

  /**
   * Send request to an url with status event
   * 
   * @param url Url to request
   * @param event Name of the event to send
   */
  async notifyViaUrl(url: string, event: string) {
    if (!url) return;    
    this.logger.log(`Notifying URL ${url} for event ${event}`);

    try {  
      return await axios.get(`${url}?status=${event}`);
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        this.logger.warn(`Failed to connect callback URL "${url}"`);
      } else {
        this.logger.error("Unknown error", error)
        throw error;
      }
    }
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
        const bookings = await this.Booking.find();
        this.logger.debug(`Found ${bookings.length} bookings`);
    
        for (let booking of bookings) {
          const id = booking._id;

          try {
            const data = await query({
              host: booking.ip, 
              port: booking.port,
              type: "tf2"
            });
    
            this.logger.debug(`Pinged ${booking.ip}:${booking.port} server, ${data.players.length} playing`);
            if (data.players.length < 2) {
              if (!this.timers[id]) {
                this.timers[id] = setTimeout(() => this.unbook(id), config.waitPeriod * 1000);
                this.logger.log(`Marked server ${id} for closure in next ${config.waitPeriod} seconds`);
              }
            } else {
              if (this.timers[id]) {
                clearTimeout(this.timers[id]);
                this.logger.log(`Unmarked server ${id} for closure`);
                delete this.timers[id];
              }
            }
          } catch (error) {
            this.logger.error(`Failed to query server ${id} (${booking.ip}:${booking.port}) due to ${error}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to monitor servers due to ${error}`);
      }
    }, 30 * 1000);
  }

  /**
   * Extract details of booking
   * 
   * @param booking Booking
   */
  extractDetails(booking: Booking) {    
    return {
      id: booking.id,
      ip: booking.ip,
      port: booking.port.toString(),
      token: booking.token
    }
  }
}
