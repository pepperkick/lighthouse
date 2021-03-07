import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface RegionAccess {
  limit: number
}

@Schema()
export class Client extends Document {
  @Prop({ type: String })
  id: string

  @Prop({ type: String })
  secret: string

  @Prop({ type: String })
  name: string

  @Prop({ type: Object })
  access: {
    games: string[],
    regions: { [key: string]: RegionAccess },
    providers: string[]
  }

  @Prop({ type: Object })
  noAccess: {
    providers: string[]
  }

  hasGameAccess: (string) => boolean
  hasRegionAccess: (string) => boolean
  hasProviderAccess: (string) => boolean
  getRegionLimit: (string) => number
}

export const ClientSchema = SchemaFactory.createForClass(Client);


ClientSchema.methods.hasGameAccess = function (game: string): boolean {
  return this.access.games.includes(game);
}

ClientSchema.methods.hasRegionAccess = function (region: string): boolean {
  return this.access.regions.hasOwnProperty(region);
}

ClientSchema.methods.hasProviderAccess = function (provider: string): boolean {
  // Check if client cannot access the provider
  if (this.noAccess.providers.includes(provider)) return false;

  // Check if client has a access list, if yes then is the provider present
  if (
    this.access.providers &&
    this.access.providers.length !== 0 &&
    !this.access.providers.includes(provider)
  ) return false;

  return true;
}

ClientSchema.methods.getRegionLimit = function (region: string): number {
  return this.access.regions[region]?.limit
}