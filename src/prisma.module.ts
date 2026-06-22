// src/prisma.module.ts

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Makes PrismaService instantly available to all other modules without re-importing
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // This allows other services (like ProductsService) to inject it
})
export class PrismaModule {}