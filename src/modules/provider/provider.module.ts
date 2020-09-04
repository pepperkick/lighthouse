import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Provider, ProviderSchema } from "./provider.model";
import { ProviderService } from "./provider.service";
import { BookingModule } from "../booking/booking.module";

@Module({
	imports: [ MongooseModule.forFeature([
		{ name: Provider.name, schema: ProviderSchema }
	]), 
	forwardRef(() => BookingModule) ],
	controllers: [ ],
	providers: [ ProviderService ],
	exports: [ ProviderService ]
})
export class ProviderModule {}
