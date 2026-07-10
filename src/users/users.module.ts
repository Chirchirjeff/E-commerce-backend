// src/users/users.module.ts

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}