import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ClientGuard } from '../utils/client.guard';
import { ProviderService } from '../../../provider/provider.service';
import { RequestWithClient } from '../../../../objects/request-with-client.interface';

@Controller("/api/v1/providers")
export class ProvidersController {
  constructor(private readonly service: ProviderService) {}

  /**
   * Get a list of available providers for the region
   */
  @Get("/region/:region")
  @UseGuards(ClientGuard)
  async availableProviders(@Req() request: RequestWithClient, @Param("region") region: string): Promise<string[]> {
    return this.service.available(request.client, region);
  }
}