import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, Logger, LogLevel } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

async function bootstrap() {
  const logLevels: LogLevel[] =
    process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['log', 'error', 'warn', 'debug'];

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
  });

  const logger = new Logger('Bootstrap');

  app.set('trust proxy', true);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // serve static files from public folder so uploaded files are reachable at /uploads/*
  app.useStaticAssets(join(process.cwd(), 'public'));

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://your-domain.com']
        : (origin, callback) => {
            if (!origin) return callback(null, true);

            const allowedDevOrigin =
              /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
              /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
              /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
              /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/.test(
                origin,
              );

            callback(null, allowedDevOrigin);
          },
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Server running on http://localhost:${port}`);
  logger.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
}

void bootstrap();
