import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductLinksService } from './product-links.service';
import { ProductLinksResolverController } from './product-links-resolver.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController, ProductLinksResolverController],
  providers: [ProductsService, ProductLinksService, PrismaService],
})
export class ProductsModule {}
