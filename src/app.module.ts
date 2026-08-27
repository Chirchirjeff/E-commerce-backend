import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { TenantMiddleware } from './tenant.middleware';
import { CategoriesModule } from './categories/categories.module';
import { MarketplaceCategoriesModule } from './marketplace-categories/marketplace-categories.module';
import { AttributesModule } from './attributes/attributes.module';
import { AuthModule } from './auth/auth.module';
import { ShopsModule } from './shops/shops.module';
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';
import { UploadsController } from './uploads/uploads.controller';
import { OrdersModule } from './orders/orders.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { KycModule } from './kyc/kyc.module';
import { SellerCollectionsModule } from './seller-collections/seller-collections.module';
import { SellerTagsModule } from './seller-tags/seller-tags.module';
import { MpesaModule } from './mpesa/mpesa.module';

@Module({
  imports: [
    // Register ConfigModule globally so ConfigService is available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    AuthModule,
    ShopsModule,
    CategoriesModule,
    MarketplaceCategoriesModule,
    AttributesModule,
    PrismaModule,
    ProductsModule,
    UsersModule,
    OrdersModule,
    AnalyticsModule,
    KycModule,
    SellerCollectionsModule,
    SellerTagsModule,
    MpesaModule,
  ],
  controllers: [AppController, UploadsController],
  providers: [
    AppService,
    // Make JwtAuthGuard global - applies to all routes
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
