import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './client.model';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema }
    ])
  ],
  providers: [ ClientsService ],
  exports: [ ClientsService ]
})
export class ClientsModule {}