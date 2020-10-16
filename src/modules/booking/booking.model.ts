import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Booking extends Document {
	@Prop({ type: String })
	_id: string
	
	@Prop({ type: String })
	id: string

	@Prop({ type: Date })
	createdAt: Date

	@Prop()
	password: string

	@Prop()
	rconPassword: string

	@Prop()
	port: number

	@Prop()
	tvPort: number

	@Prop({ required: true })
	token: string

	@Prop({ required: true })
	bookedBy: string

	@Prop()
	ip: string

	@Prop()
	image: string

	@Prop({ required: true })
	provider: string

	@Prop()
	callbackUrl: string

	@Prop()
	metadata: {}

	@Prop()
	selectors: {}

	@Prop({ type: Boolean })
	markForUnbook: boolean

	@Prop()
	autoClose: {
		time: number
		min: number
	}
}

export const BookingSchema = SchemaFactory.createForClass(Booking); 