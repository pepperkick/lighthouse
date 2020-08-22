import { Injectable, Logger } from "@nestjs/common";
import { Client } from '@elastic/elasticsearch'
import * as config from "../../../config.json"

@Injectable()
export class ElasticService {
  private readonly logger = new Logger(ElasticService.name);
  elastic: Client;

  constructor() {
    this.elastic = new Client({ node: config.elastic.host })
  }

  async sendData(body: {}) {
    this.logger.debug(`Sending elastic data at index ${config.elastic.index} with body: ${JSON.stringify(body)}`);
    await this.elastic.index({
      index: config.elastic.index,
      body
    });
  }
}