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

  @Prop({ type: Date })
  closeAt: Date

  @Prop()
  port: number

  @Prop()
  ip: string

  @Prop()
  region: string

  @Prop({ required: true })
  provider: string

  @Prop()
  image: string

  @Prop({ type: String })
  status: ServerStatus

  @Prop({ type: Object })
  data: {
    // For TF2, Valheim
    password?: string

    // For TF2
    servername?: string
    rconPassword?: string
    tvEnable?: boolean
    tvPassword?: string
    tvPort?: number
    tvName?: string
    map?: string

    // For Minecraft
    rconPort?: number

    // For Valheim
    world?: string

    // For Status Updates
    callbackUrl?: string

    // For Auto Close
    closeMinPlayers?: number
    closeIdleTime?: number
    closeWaitTime?: number

    // For Git Repository
    gitRepository?: string
    gitDeployKey?: string

    // For Hatch
    hatchAddress?: string
    hatchPassword?: string
    hatchElasticURL?: string

    hatchElasticChatIndex?: string
    hatchElasticLogsIndex?: string
  }
}

export const ServerSchema = SchemaFactory.createForClass(Server);