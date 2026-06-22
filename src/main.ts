// src/main.ts
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter'; // ◄ Import your new filter

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  app.set('trust proxy', true);
  
  // Register global validation checks
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // REGISTER GLOBAL ERROR FILTER HERE! 💥
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(3000);
  console.log('🚀 Multi-vendor backend core listening on http://localhost:3000');
}
bootstrap();