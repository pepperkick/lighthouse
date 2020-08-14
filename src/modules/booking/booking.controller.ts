import { Controller, Post, Body, Delete, Get, Param } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PostBookDTO } from './dto/post-book.dto';
import { BookingDTO } from './dto/booking.dto';
import { BookingStatusDTO } from './dto/booking-status.dto';

@Controller("/booking")
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Get("/book")
  async bookStatus(): Promise<BookingStatusDTO> {
    return await this.service.bookStatus();
  }

  @Post("/book")
  async bookServer(@Body() data: PostBookDTO): Promise<BookingDTO> {
    return await this.service.bookServer(data);
  }

  @Delete("/book/:id")
  async unbookServer(@Param("id") id: string): Promise<void> {
    return await this.service.unbookServer(id);
  }
}
