import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma.module';
import { AdminProfileChangesController, SellerProfileChangesController } from './profile-changes.controller';
import { ProfileChangesService } from './profile-changes.service';

@Module({
  imports: [AuthModule, EmailModule, PrismaModule],
  controllers: [SellerProfileChangesController, AdminProfileChangesController],
  providers: [ProfileChangesService],
})
export class ProfileChangesModule {}
