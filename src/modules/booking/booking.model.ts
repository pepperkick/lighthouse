import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Booking extends Document {
	@Prop({ type: String })
	_id: string
	
	@Prop({ type: String })
	id: string

	@Prop()
	password: string

	@Prop()
	rconPassword: string

	@Prop({ required: true })
	port: number

	@Prop()
	tvPort: number

	@Prop({ required: true })
	token: string

	@Prop({ required: true })
	ip: string

	@Prop({ required: true })
	provider: string

	@Prop()
	callbackUrl: string

	@Prop()
	metadata: {}

	@Prop()
	selectors: {}
}

export const BookingSchema = SchemaFactory.createForClass(Booking); 