import { Module } from "@nestjs/common";
import { GSTokenService } from "./gstoken.service";
import { MongooseModule } from "@nestjs/mongoose";
import { GSToken, GSTokenSchema } from "./gstoken.model";

@Module({
	imports: [ MongooseModule.forFeature([
		{ name: GSToken.name, schema: GSTokenSchema }
	])],
	controllers: [ ],
	providers: [ GSTokenService ],
	exports: [ GSTokenService ]
})
export class GSTokenModule {}
