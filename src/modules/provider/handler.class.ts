import { Provider } from "./provider.model";
import { Logger } from "@nestjs/common";
import { BookingService } from "../booking/booking.service";

export interface InstanceOptions {
	id: string
	token: string
	password?: string
	rconPassword?: string
	servername?: string
	image?: string
	port?: number
}

export class Handler {
	readonly logger = new Logger(Handler.name);	

	constructor(
		readonly provider: Provider,
		readonly bookingService: BookingService
	) {
		this.logger.debug(`Created new provider handler with id ${this.provider._id}`);
	}

	createInstance(options: InstanceOptions) {}

	destroyInstance(id: string) {}
	
	/**
	 * Get free server game port
	 */
	async getFreePort() {    
		const inUse = await this.bookingService.getInUseBookings(this.provider);
		const inUsePorts: number[] = inUse.map(e => e.port);
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
			this.provider.metadata.ports.max - this.provider.metadata.ports.min) + this.provider.metadata.ports.min)) / 2))* 2);
	}
}