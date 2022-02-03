import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from './client.model';

export class ClientsService {
  constructor(@InjectModel(Client.name) private Client: Model<Client>) {}

  /**
   * Get client object by secret
   * */
  async getBySecret(secret: string): Promise<Client> {
    return this.Client.findOne({ secret });
  }

  /**
   * Validate if clientId and secret match
   * */
  async validateCredentials(id: string, secret: string): Promise<boolean> {
    const client = await this.getBySecret(secret);
    return client.id === id;
  }
}
