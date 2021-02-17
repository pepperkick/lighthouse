import { Client } from '../modules/clients/client.model';

export interface RequestWithClient extends Request {
  client: Client
}