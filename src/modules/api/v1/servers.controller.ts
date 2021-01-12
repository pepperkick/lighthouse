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
  @UseGuards(ClientGuard)
  async get(@Req() request: RequestWithClient, @Query("all") all: boolean): Promise<Server[]> {
    if (all)
      return this.service.getAll(request.client);

    return this.service.getActive(request.client);
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
    return this.service.getById(request.client, id);
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