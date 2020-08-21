import { Module } from "@nestjs/common";
import { MongooseModule } from '@nestjs/mongoose';
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import { Booking, BookingSchema } from "./booking.model";

@Module({
  imports: [ MongooseModule.forFeature([
    { name: Booking.name, schema: BookingSchema }
  ]) ],
  controllers: [ BookingController ],
  providers: [ BookingService ],
})
export class BookingModule {}
