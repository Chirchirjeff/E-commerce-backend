import { Module } from '@nestjs/common';
import { SellerCollectionsService } from './seller-collections.service';
import { SellerCollectionsController } from './seller-collections.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SellerCollectionsController],
  providers: [SellerCollectionsService, PrismaService],
  exports: [SellerCollectionsService],
})
export class SellerCollectionsModule {}
