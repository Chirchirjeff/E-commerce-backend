// src/products/products.module.ts

import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaService } from '../prisma.service'; // Added: Import your database bridge

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService, 
    PrismaService // Added: Gives ProductsService access to the database context
  ],
})
export class ProductsModule {}