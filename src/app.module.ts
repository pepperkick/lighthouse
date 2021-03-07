import { Module } from '@nestjs/common';
import { ApiModule } from './modules/api/api.module';
import { ServersModule } from './modules/servers/servers.module';
import { MongooseModule } from '@nestjs/mongoose';
import * as config from "../config.json"

@Module({
	imports: [
		ApiModule,
		ServersModule,
		MongooseModule.forRoot(config.mongodbUri)
	]
})
export class AppModule {}
