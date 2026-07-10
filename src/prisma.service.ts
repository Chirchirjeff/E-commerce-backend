import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  public client: PrismaClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      this.logger.error('Missing DATABASE_URL in .env file');
      process.exit(1);
    }

    this.client = new PrismaClient({
      log: [{ emit: 'event', level: 'error' }],
    });

    (this.client as any).$on('error', (event: { message: string }) => {
      this.logger.error(`Prisma Client error: ${event.message}`);
    });
  }

  async onModuleInit() {
    try {
      this.logger.log('Connecting to database...');

      const result = await this.client.$queryRaw<Array<{ db: string; usr: string }>>`
        SELECT current_database() as db, current_user as usr
      `;

      this.logger.log(`Database connection successful: ${result[0].db} as ${result[0].usr}`);
      await this.client.$connect();
      this.logger.log('Prisma client connected');
    } catch (error) {
      this.logger.error('Database connection failed');
      this.logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    this.logger.log('Database disconnected');
  }

  get tenantClient() {
    return this.client;
  }
}
