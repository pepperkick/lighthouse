import { BookingDTO } from "./booking.dto";

export interface BookingStatusDTO {
  limit: number
  inUse: number
  bookings: BookingDTO[]
}