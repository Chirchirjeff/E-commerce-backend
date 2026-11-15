/**
 * SystemDocsController
 * ====================
 * POST   /system-docs           — Upload a document (multipart/form-data)
 * GET    /system-docs           — List all docs (optional ?category= filter)
 * GET    /system-docs/categories — List distinct categories
 * GET    /system-docs/:id       — Get one doc
 * PATCH  /system-docs/:id       — Update title / category / description
 * DELETE /system-docs/:id       — Delete a doc
 *
 * All routes require can_manage_settings permission.
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SystemDocsService } from './system-docs.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Accepted MIME types for documentation files
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

@Controller('system-docs')
@UseGuards(PermissionsGuard)
export class SystemDocsController {
  constructor(private readonly systemDocsService: SystemDocsService) {}

  @Post()
  @RequirePermissions('can_manage_settings')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `File type not allowed. Accepted: PDF, Word, Excel, JSON, TXT, Markdown, CSV`,
            ) as any,
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('category') category: string,
    @Body('description') description: string,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!title?.trim()) throw new BadRequestException('title is required');

    return this.systemDocsService.upload({
      title,
      category,
      description,
      uploadedBy: user.id,
      file,
    });
  }

  @Get('categories')
  @RequirePermissions('can_manage_settings')
  async listCategories() {
    return this.systemDocsService.listCategories();
  }

  @Get()
  @RequirePermissions('can_manage_settings')
  async findAll(@Query('category') category?: string) {
    return this.systemDocsService.findAll(category);
  }

  @Get(':id')
  @RequirePermissions('can_manage_settings')
  async findOne(@Param('id') id: string) {
    return this.systemDocsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('can_manage_settings')
  async update(
    @Param('id') id: string,
    @Body() body: { title?: string; category?: string; description?: string },
  ) {
    return this.systemDocsService.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('can_manage_settings')
  async remove(@Param('id') id: string) {
    return this.systemDocsService.remove(id);
  }
}
