import { Injectable, BadRequestException, ConflictException, NotFoundException, HttpException, HttpService, HttpStatus, Logger, InternalServerErrorException, forwardRef, Inject } from '@nestjs/common';
import { BookingDTO } from './dto/booking.dto';
import { BookingStatusDTO } from './dto/booking-status.dto';
import { PostBookDTO } from './dto/post-book.dto';
import { query } from "gamedig";
import * as ApiClient from 'kubernetes-client';
import * as crypto from "crypto";
import * as config from "../../../config.json"
import { InjectModel } from '@nestjs/mongoose';
import { Booking } from './booking.model';
import { Model } from 'mongoose';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { GSTokenService } from '../gstoken/gstoken.service';
import { ElasticService } from './elastic.service';
import { ProviderService } from '../provider/provider.service';
import { Provider } from '../provider/provider.model';

enum StatusEvent {
	BOOK = 'BOOK',
	BOOK_START = 'BOOK_START',
	BOOK_FAILED = 'BOOK_FAILED',
	BOOK_END = 'BOOK_END',
	UNBOOK = 'UNBOOK',
	UNBOOK_START = 'UNBOOK_START',
	UNBOOK_FAILED = 'UNBOOK_FAILED',
	UNBOOK_END = 'UNBOOK_END'
}

@Injectable()
export class BookingService {
	private readonly logger = new Logger(BookingService.name);
	private readonly kube = new ApiClient.Client1_13({ version: '1.13' });
	private timers = {};

	constructor(
		@InjectModel(Booking.name) private Booking: Model<Booking>, 
		private elasticService: ElasticService,
    @Inject(forwardRef(() => GSTokenService))
		private tokenService: GSTokenService,
    @Inject(forwardRef(() => ProviderService))
		private providerService: ProviderService
	) {
		this.monitorServers();
	}

	/**
	 * Get status of all tf2 deployment
	 */
	async statusAll(hiddenProviders = false): Promise<BookingStatusDTO> {
		const bookings: BookingDTO[] = await this.Booking.find();
		const providers = await this.providerService.status(hiddenProviders);

		return { providers, bookings }
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
	 * Check if the book request can be handled
	 * 
	 * @param data PostBookDTO 
	 */
	async bookRequest(data: PostBookDTO): Promise<void> {
		await this.checkHasBooking(data.id);
		
		const provider = await this.providerService.find(data.selectors);
		
		if (!provider) {
			throw new HttpException(`Reached limit`, HttpStatus.TOO_MANY_REQUESTS);
		}

		this.book(provider, data);
	}

	/**
	 * Create a new tf2 deployment
	 * 
	 * @param provider Provider 
	 * @param data PostBookDTO 
	 */
	async book(provider: Provider, data: PostBookDTO): Promise<BookingDTO> {
		const token = await (await this.tokenService.reserve()).login_token;
		const password = data.password || crypto.randomBytes(4).toString('hex');
		const rconPassword = data.rconPassword || crypto.randomBytes(4).toString('hex');

		try {        
			await this.notifyViaUrl(data.callbackUrl, StatusEvent.BOOK_START, { metadata: data.metadata });

			const booking = new this.Booking();
			booking._id = data.id;
			booking.id = data.id;
			booking.token = token;
			booking.callbackUrl = data.callbackUrl || "";
			booking.metadata = data.metadata;
			booking.provider = provider.id;
			booking.createdAt = new Date();
			await booking.save();

			const instance = await this.providerService.createInstance(provider, {
				id: data.id || uuid(),
				token,
				password,
				rconPassword,
				port: data.port || null,
				image: data.image || null
			})

			booking.selectors = instance.selectors;
			booking.password = instance.password;
			booking.rconPassword = instance.rconPassword;
			booking.port = instance.port;
			if (instance.tv)
				booking.tvPort = instance.tv.port;
			booking.ip = instance.ip;
			booking.autoClose = data.autoClose || instance.provider.autoClose
			await booking.save();
		
			await this.notifyViaUrl(data.callbackUrl, StatusEvent.BOOK_END, { booking: booking.toJSON(), metadata: data.metadata });
	
			this.logger.log(`Server booked ${data.id}, (${instance.ip}:${instance.port} ${password} ${rconPassword})`);

			this.elasticService.sendData({
				timestamp: new Date(),
				event: StatusEvent.BOOK,
				...this.extractDetails(booking)
			});
	
			return booking;
		} catch (error) {
			this.logger.error(`Failed to create booking for id ${data.id}`, error);
			console.log(error);
			await this.tokenService.release(token);
			await this.notifyViaUrl(data.callbackUrl, StatusEvent.BOOK_FAILED, { metadata: data.metadata });
			throw new InternalServerErrorException("Failed to create booking");
		}
	}

	
	/**
	 * Check if the unbook request can be handled
	 * 
	 * @param id Booking ID
	 */
	async unbookRequest(id: string, data: { metadata: any }): Promise<void> {
		const booking = await this.Booking.findById(id);
		
		if (!booking) {
			throw new NotFoundException(`Could not find any booking with ID ${id}`);
		}

		this.unbook(booking, data);
	}
	
	/**
	 * Remove user's tf2 deployment
	 * 
	 * @param booking Booking
	 */
	async unbook(booking: Booking, data?: { metadata: any }): Promise<void> {
		const id = booking.id;

		await this.notifyViaUrl(booking.callbackUrl, StatusEvent.UNBOOK_START, { metadata: data?.metadata });

		try {
			await this.providerService.deleteInstance(booking.provider, booking.id);
			await this.Booking.deleteOne({ _id: id });
		} catch (error) {
			await this.notifyViaUrl(booking.callbackUrl, StatusEvent.UNBOOK_FAILED, { metadata: data?.metadata });
			if (error.statusCode === 404) {
				this.logger.warn(`Found booking entry for "${id}" but could not find deployment, removing entry.`);
			} else {
				this.logger.error("Unknown error", error)
				throw error;
			}
		} finally {    
			// Clear unbook timer if any
			this.unmarkServerForUnbook(booking);

			await this.tokenService.release(booking.token);
			
			this.elasticService.sendData({
				timestamp: new Date(),
				event: StatusEvent.UNBOOK,
				...this.extractDetails(booking)
			});
		}

		await this.notifyViaUrl(booking.callbackUrl, StatusEvent.UNBOOK_END, { metadata: data?.metadata });

		this.logger.log(`Server unbooked ${id}`);
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
	 * Get bookings using the provider
	 * 
	 * @param provider Provider
	 */
	async getInUseBookingsForProvider(provider: Provider) {
		const id = provider.id;
		return this.Booking.find({ "provider": id });
	}

	/**
	 * Get bookings
	 */
	async getInUseBookings() {
		return this.Booking.find();
	}

	/**
	 * Send request to an url with status event
	 * 
	 * @param url Url to request
	 * @param event Name of the event to send
	 * @param data Data to send
	 */
	async notifyViaUrl(url: string, event: string, data = {}) {
		if (!url) return;    
		this.logger.log(`Notifying URL ${url} for event ${event}`);

		try {  
			return await axios.post(`${url}?status=${event}`, data);
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

					const provider = await this.providerService.get(booking.provider);
					const min = provider.metadata.autoClose.min || 2;
					const time = provider.metadata.autoClose.time || 900;

					try {
						const data = await query({
							host: booking.ip, 
							port: booking.port,
							type: "tf2"
						});
		
						this.logger.debug(`Pinged ${booking._id} (${booking.ip}:${booking.port}) server, ${data.players.length} playing`);
						

						if (data.players.length < min) {
							this.markServerForUnbook(booking, time);
						} else {
							this.unmarkServerForUnbook(booking);
						}
					} catch (error) {
						this.logger.error(`Failed to query server ${id} (${booking.ip}:${booking.port}) due to ${error}`);
						this.markServerForUnbook(booking);
					}
				}
			} catch (error) {
				this.logger.error(`Failed to monitor servers due to ${error}`);
			}
		}, 30 * 1000);
	}

	private markServerForUnbook(booking: Booking, time = 900) {
		const id = booking.id;

		if (!this.timers[id]) {
			this.timers[id] = setTimeout(() => this.unbook(booking), time * 1000);
			this.logger.log(`Marked server ${id} for closure in next ${time} seconds`);
		}
	}

	private unmarkServerForUnbook(booking: Booking) {
		const id = booking.id;

		if (this.timers[id]) {
			clearTimeout(this.timers[id]);
			this.logger.log(`Unmarked server ${id} for closure`);
			delete this.timers[id];
		}
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
			token: booking.token,
			...booking.selectors
		}
	}
}
