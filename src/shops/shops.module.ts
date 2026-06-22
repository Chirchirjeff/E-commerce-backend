// src/shops/shops.module.ts

import { Module } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { ShopsController } from './shops.controller';
import { PrismaService } from '../prisma.service'; // Ensure this relative path is correct!

@Module({
  controllers: [ShopsController],
  providers: [
    ShopsService,
  ], 
})
export class ShopsModule {}