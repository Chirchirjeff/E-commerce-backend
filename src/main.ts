import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe, Logger, LogLevel } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggingInterceptor } from './logging.interceptor';

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

  // Global exception filter for all errors
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global logging interceptor for all requests
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Middleware to add CORS headers to static files
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

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
  logger.log(`🔍 Request logging: ENABLED`);
  logger.log(`🛡️  Global exception filter: ENABLED`);
}

void bootstrap();
