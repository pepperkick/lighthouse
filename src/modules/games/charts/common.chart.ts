import { Server } from '../../servers/server.model';
import { NotImplementedException } from '@nestjs/common';

export class GameChart {
  static renderDeployment(
    options: Server,
    hostname: string,
    instanceLabel: string,
  ): string {
    throw new NotImplementedException();
  }

  static getArgs(options: Server): string {
    throw new NotImplementedException();
  }
}
