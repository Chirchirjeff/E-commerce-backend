// src/app.module.ts

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { TenantMiddleware } from './tenant.middleware'; // FIXED: Path corrected to current directory
import { CategoriesModule } from './categories/categories.module';
import { AuthModule } from './auth/auth.module';
import { ShopsModule } from './shops/shops.module'; // FIXED: Importing the Module, not individual pieces
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';
import { UploadsController } from './uploads/uploads.controller';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    AuthModule,
    ShopsModule, // FIXED: Registered the clean module wrapper here
    CategoriesModule,
    PrismaModule,
    ProductsModule,
    UsersModule,
    OrdersModule,
  ],
  controllers: [AppController, UploadsController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*'); // Apply tenant isolation logic globally across all module routes
  }
}
