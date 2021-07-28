import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ServerStatus } from '../../objects/server-status.enum';
import { Game } from '../../objects/game.enum';

@Schema()
export class Server extends Document {
  @Prop({ type: String, required: true })
  client: string

  @Prop({ type: String, required: true })
  game: Game

  @Prop({ type: Date })
  createdAt: Date

  @Prop()
  password: string

  @Prop()
  rconPassword: string

  @Prop()
  tvPassword: string

  @Prop()
  port: number

  @Prop()
  tvPort: number

  @Prop()
  ip: string

  @Prop()
  region: string

  @Prop({ required: true })
  provider: string

  @Prop({ type: String })
  status: ServerStatus

  @Prop()
  callbackUrl: string

  @Prop()
  data: {
    // For hatch
    hatchAddress?: string
    hatchPassword?: string

    // For git repository
    git_repository?: string
    git_deploy_key?: string

    // For minecraft
    rconPort?: number
  }

  @Prop({ type: Boolean })
  markForClose: boolean

  @Prop({ type: Date })
  closeAt: Date

  @Prop()
  closePref: {
    minPlayers: number
    idleTime: number
    waitTime: number
  }
}

export const ServerSchema = SchemaFactory.createForClass(Server);