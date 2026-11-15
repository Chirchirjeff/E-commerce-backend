import { Module } from '@nestjs/common';
import { GpcImportController } from './gpc-import.controller';
import { GpcImportService } from './gpc-import.service';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GpcImportController],
  providers: [GpcImportService],
  exports: [GpcImportService],
})
export class GpcImportModule {}
