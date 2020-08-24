import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingModule } from './modules/booking/booking.module';
import * as config from 'config.json'
import { GSTokenModule } from './modules/gstoken/gstoken.module';
import { ProviderModule } from './modules/provider/provider.module';

@Module({
	imports: [ 
		BookingModule,
		GSTokenModule,
		ProviderModule,
		MongooseModule.forRoot(config.mongodbUri)
	],
	controllers: [ AppController ],
	providers: [ AppService ],
})
export class AppModule {}
