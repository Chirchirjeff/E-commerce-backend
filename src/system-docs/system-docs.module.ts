import { Module } from '@nestjs/common';
import { SystemDocsController } from './system-docs.controller';
import { SystemDocsService } from './system-docs.service';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SystemDocsController],
  providers: [SystemDocsService],
  exports: [SystemDocsService],
})
export class SystemDocsModule {}
