import { Module } from '@nestjs/common';
import { MarketplaceCategoriesService } from './marketplace-categories.service';
import { MarketplaceCategoriesController } from './marketplace-categories.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MarketplaceCategoriesController],
  providers: [MarketplaceCategoriesService, PrismaService],
  exports: [MarketplaceCategoriesService],
})
export class MarketplaceCategoriesModule {}
