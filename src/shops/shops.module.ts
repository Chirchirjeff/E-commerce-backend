import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopLinksResolverController } from './shop-links-resolver.controller';
import { ShopsService } from './shops.service';
import { ShopLinksService } from './shop-links.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [
    AuthModule, // Import AuthModule to get JwtAuthGuard and JwtService
    PrismaModule,
  ],
  controllers: [ShopsController, ShopLinksResolverController],
  providers: [ShopsService, ShopLinksService],
  exports: [ShopsService, ShopLinksService],
})
export class ShopsModule {}