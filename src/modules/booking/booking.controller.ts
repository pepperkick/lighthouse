import { Controller, Post, Body, Delete, Get, Param, BadRequestException, Query } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PostBookDTO } from './dto/post-book.dto';
import { BookingDTO } from './dto/booking.dto';
import { BookingStatusDTO } from './dto/booking-status.dto';

@Controller("/booking")
export class BookingController {
	constructor(private readonly service: BookingService) {}

	@Get()
	async allBookStatus(@Query("hiddenProviders") hiddenProviders: boolean): Promise<BookingStatusDTO> {
		return await this.service.statusAll(hiddenProviders);
	}

	@Get("/:id")
	async bookStatus(@Param("id") id: string): Promise<BookingDTO> {
		if (!id || id == "") throw new BadRequestException("Invalid Booking ID");

		return await this.service.statusById(id);
	}

	@Post()
	async bookServer(@Body() data: PostBookDTO): Promise<void> {
		return await this.service.bookRequest(data);
	}

	@Delete("/:id")
	async unbookServer(@Param("id") id: string, @Body() data: { metadata: any }): Promise<void> {
		return await this.service.unbookRequest(id, data);
	}
}
