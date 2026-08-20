import { Module } from '@nestjs/common';
import { SellerTagsService } from './seller-tags.service';
import { SellerTagsController } from './seller-tags.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SellerTagsController],
  providers: [SellerTagsService, PrismaService],
  exports: [SellerTagsService],
})
export class SellerTagsModule {}
