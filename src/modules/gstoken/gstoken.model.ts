import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Booking } from '../booking/booking.model';

@Schema()
export class GSToken extends Document {  
  @Prop({ type: String })
  login_token: string

  @Prop({ type: String })
  steamid: string

  @Prop({ type: Boolean })
  inUse: boolean
}

export const GSTokenSchema = SchemaFactory.createForClass(GSToken); 