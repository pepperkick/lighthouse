import { Module } from '@nestjs/common';
import { ServersService } from './servers.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Server, ServerSchema } from './server.model';
import { ProviderModule } from '../provider/provider.module';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [
    ProviderModule,
    GamesModule,
    MongooseModule.forFeature([
      { name: Server.name, schema: ServerSchema }
    ])
  ],
  providers: [ ServersService ],
  exports: [ ServersService ]
})
export class ServersModule {}