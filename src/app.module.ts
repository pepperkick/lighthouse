import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingModule } from './modules/booking/booking.module';
import * as config from 'config.json'

@Module({
  imports: [ 
    BookingModule,
    ConfigModule.forRoot(),
    MongooseModule.forRoot(config.mongodbUri)
  ],
  controllers: [ AppController ],
  providers: [ AppService ],
})
export class AppModule {}
