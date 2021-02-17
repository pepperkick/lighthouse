import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClientsService } from '../../clients/clients.service';

@Injectable()
export class ClientGuard implements CanActivate {
  constructor(private readonly service: ClientsService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;

    if (!token)
      throw new UnauthorizedException("Client secret missing");

    const secret = token.split(" ")[1];
    const client = await this.service.getBySecret(secret);

    if (!client)
      throw new UnauthorizedException("Invalid client credentials");

    request.client = client

    return true;
  }
}