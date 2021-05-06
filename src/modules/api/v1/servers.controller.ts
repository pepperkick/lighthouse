import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ServerRequestOptions, ServersService } from '../../servers/servers.service';
import { ClientGuard } from './client.guard';
import { Server } from '../../servers/server.model';
import { RequestWithClient } from '../../../objects/request-with-client.interface';

@Controller("/api/v1/servers")
export class ServersController {
  constructor(private readonly service: ServersService) {}

  /**
   * Get list of servers
   */
  @Get("/")
  async getServers(@Query("all") all: boolean): Promise<Server[]> {
    if (all)
      return this.service.getAllServers();

    return this.service.getActiveServers();
  }

  /**
   * Get list of servers by client
   */
  @Get("/client")
  @UseGuards(ClientGuard)
  async getServersByClient(@Req() request: RequestWithClient, @Query("all") all: boolean): Promise<Server[]> {
    if (all)
      return this.service.getAllServersByClient(request.client);

    return this.service.getActiveServersByClient(request.client);
  }

  /**
   * Create a request for new server
   */
  @Post("/")
  @UseGuards(ClientGuard)
  async create(@Body() body: ServerRequestOptions, @Req() request: RequestWithClient): Promise<Server> {
    return this.service.createRequest(request.client, body);
  }

  /**
   * Get server info by id
   */
  @Get("/:id")
  @UseGuards(ClientGuard)
  async getServer(@Req() request: RequestWithClient, @Param("id") id: string): Promise<Server> {
    return this.service.getByIdForClient(request.client, id);
  }

  /**
   * Create a request for new server
   */
  @Delete("/:id")
  @UseGuards(ClientGuard)
  async delete(@Req() request: RequestWithClient, @Param("id") id: string): Promise<void> {
    return this.service.closeRequest(request.client, id);
  }
}