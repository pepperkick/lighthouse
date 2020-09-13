import { Module, forwardRef } from "@nestjs/common";
import { GSTokenService } from "./gstoken.service";
import { MongooseModule } from "@nestjs/mongoose";
import { GSToken, GSTokenSchema } from "./gstoken.model";
import { BookingModule } from "../booking/booking.module";

@Module({
	imports: [ MongooseModule.forFeature([
		{ name: GSToken.name, schema: GSTokenSchema }
	]),
	forwardRef(() => BookingModule) ],
	controllers: [ ],
	providers: [ GSTokenService ],
	exports: [ GSTokenService ]
})
export class GSTokenModule {}
