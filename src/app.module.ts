import { Module } from '@nestjs/common';
import { ApiModule } from './modules/api/api.module';
import { ServersModule } from './modules/servers/servers.module';
import { MongooseModule } from '@nestjs/mongoose';
import * as config from '../config.json';
import {
  ControllerInjector,
  EventEmitterInjector,
  GuardInjector,
  OpenTelemetryModule,
  PipeInjector,
  ScheduleInjector,
} from '@metinseylan/nestjs-opentelemetry';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// @ts-ignore
@Module({
  imports: [
    ApiModule,
    ServersModule,
    MongooseModule.forRoot(config.mongodbUri),
    OpenTelemetryModule.forRoot({
      traceAutoInjectors: [
        ControllerInjector,
        GuardInjector,
        EventEmitterInjector,
        ScheduleInjector,
        PipeInjector,
      ],
      applicationName: config.tracing.name,
      //@ts-ignore
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.tracing.name,
      }),
      //@ts-ignore
      spanProcessor: new SimpleSpanProcessor(
        new JaegerExporter({
          endpoint: config.tracing.jaeger.endpoint,
        }),
      ),
    }),
  ],
})
export class AppModule {}
