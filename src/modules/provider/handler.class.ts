import { Provider } from "./provider.model";
import { Logger, NotImplementedException } from '@nestjs/common';
import { Server } from '../servers/server.model';

export class Handler {
	readonly logger = new Logger(Handler.name);	

	constructor(
		readonly provider: Provider
	) {
		this.logger.debug(`Created new provider handler with id ${this.provider._id}`);
	}

	createInstance(server: Server): Promise<Server> {
		throw new NotImplementedException()
	}

	destroyInstance(server: Server): Promise<void> {
		throw new NotImplementedException()
	}
}