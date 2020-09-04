import { Module } from "@nestjs/common";
import { MongooseModule } from '@nestjs/mongoose';
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import { Booking, BookingSchema } from "./booking.model";
import { GSTokenModule } from "../gstoken/gstoken.module";
import { ElasticService } from "./elastic.service";
import { ProviderModule } from "../provider/provider.module";

@Module({
	imports: [ 
		GSTokenModule, 
		ProviderModule,
		MongooseModule.forFeature([
			{ name: Booking.name, schema: BookingSchema }
		]) 
	],
	controllers: [ BookingController ],
	providers: [ BookingService, ElasticService ],
	exports: [ BookingService ]
})
export class BookingModule {}
