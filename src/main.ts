import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

const logger = new Logger('Main');

async function bootstrap() {
  const { LIGHTHOUSE_OPERATION_MODE, LIGHTHOUSE_SERVER_ID } = process.env;

  if (LIGHTHOUSE_OPERATION_MODE === 'manager') {
    logger.log("Running lighthouse in 'manager' mode.");
    const AppModule = require('./app.module').AppModule;
    const app = await NestFactory.create(AppModule);
    await app.listen(3000);
  } else if (LIGHTHOUSE_OPERATION_MODE === 'provider') {
    const AppModule = require('./app.module').AppModule;
    const app = await NestFactory.createApplicationContext(AppModule);

    try {
      logger.log("Running lighthouse in 'provider' mode.");
      const ServersModule = require('./modules/servers/servers.module')
        .ServersModule;
      const ServersService = require('./modules/servers/servers.service')
        .ServersService;

      const serversService = app.select(ServersModule).get(ServersService);
      const server = await serversService.getById(LIGHTHOUSE_SERVER_ID);

      if (!(await serversService.processRequest(server))) {
        throw new Error('Failed to process request');
      }

      await app.close();
      process.exit(0);
    } catch (exception) {
      logger.error(
        `Failed to carry out the request ${exception}`,
        exception.stack,
      );
      await app.close();
      process.exit(1);
    }
  } else {
    logger.error(
      `Unknown operation mode '${LIGHTHOUSE_OPERATION_MODE}' is provided.`,
    );
  }
}

bootstrap();
