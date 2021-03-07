import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Provider, ProviderSchema } from "./provider.model";
import { ProviderService } from "./provider.service";

@Module({
	imports: [ MongooseModule.forFeature([
		{ name: Provider.name, schema: ProviderSchema }
	])],
	controllers: [ ],
	providers: [ ProviderService ],
	exports: [ ProviderService ]
})
export class ProviderModule {}
