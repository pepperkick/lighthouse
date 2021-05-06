import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Type } from 'gamedig';

@Schema()
export class Game extends Document {
  @Prop({ type: String })
  slug: string

  @Prop({ type: String })
  name: string

  @Prop()
  data: {
    queryType: Type
    providerOverrides: {
      kubernetes: any
      gcp: any
      azure: any
      digital_ocean: any
      vultr: any
      binarylane: any
    }
  }
}

export const GameSchema = SchemaFactory.createForClass(Game);