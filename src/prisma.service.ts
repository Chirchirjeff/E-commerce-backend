// src/prisma.service.ts

import { Injectable, OnModuleInit, Scope, Inject, Logger } from '@nestjs/common';
import * as PrismaAll from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class PrismaService implements OnModuleInit {
  private static pool: Pool;
  private static adapter: PrismaPg;
  private static isConnected = false;
  
  private readonly logger = new Logger('PrismaService');
  public client: any;

  constructor(@Inject(REQUEST) private request: Request) {
    // FIXED: Read the unified connection string directly from process.env
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      this.logger.error('❌ Missing DATABASE_URL in .env file!');
      process.exit(1);
    }

    if (!PrismaService.pool) {
      PrismaService.pool = new Pool({ 
        connectionString,
        max: 20, 
      });
      PrismaService.adapter = new PrismaPg(PrismaService.pool);
    }

    const DynamicClient = (PrismaAll as any).PrismaClient;
    this.client = new DynamicClient({ adapter: PrismaService.adapter });
  }

  async onModuleInit() {
    if (!PrismaService.isConnected) {
      try {
        this.logger.log('Attempting to connect to PostgreSQL via PG Driver Adapter...');
        await PrismaService.pool.query('SELECT 1');
        PrismaService.isConnected = true;
        this.logger.log('🎉 Database driver connection established and validated successfully!');
      } catch (error) {
        this.logger.error('❌ Database connection validation failed! Check your DATABASE_URL inside .env');
        this.logger.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    await this.client.$connect();
  }

  get tenantClient() {
    const shopId = (this.request as any).shopId;

    if (!shopId) {
      return this.client; 
    }

    return this.client.$extends({
      query: {
        product: {
          async findMany({ args, query }: any) {
            args.where = { ...args.where, shopId };
            return query(args);
          },
          async findUnique({ args, query }: any) {
            return (this as any).findFirst({
              where: { ...args.where, shopId },
            });
          },
        },
        category: {
          async findMany({ args, query }: any) {
            args.where = { ...args.where, shopId };
            return query(args);
          },
        },
        order: {
          async findMany({ args, query }: any) {
            args.where = { ...args.where, shopId };
            return query(args);
          },
        },
      },
    });
  }
}