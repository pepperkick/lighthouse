import { Module } from "@nestjs/common";
import { ServersModule } from '../../servers/servers.module';
import { ServersController } from './servers.controller';
import { ClientsModule } from '../../clients/clients.module';
import { ProvidersController } from './providers.controller';
import { ProviderModule } from '../../provider/provider.module';

@Module({
  imports: [ ServersModule, ProviderModule, ClientsModule ],
  controllers: [ ServersController, ProvidersController ]
})
export class V1Module {}