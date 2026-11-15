/**
 * GpcImportController
 * ===================
 * POST /gpc/import    — Upload a GPC JSON file; streams SSE progress back.
 * GET  /gpc/versions  — List all taxonomy versions.
 * POST /gpc/versions/:id/set-current — Promote a version to isCurrent.
 *
 * SSE wire format (each event):
 *   data: {"phase":"insert","message":"...","current":500,"total":6463,"pct":14}\n\n
 *
 * The final event has phase:"done" or phase:"error".
 * The browser can close the EventSource once it receives either.
 */
import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { GpcImportService } from './gpc-import.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('gpc')
@UseGuards(PermissionsGuard)
export class GpcImportController {
  private readonly logger = new Logger(GpcImportController.name);

  constructor(private readonly gpcImportService: GpcImportService) {}

  /**
   * Upload GPC JSON → stream import progress as SSE.
   *
   * The client opens a standard fetch() (not EventSource, because EventSource
   * is GET-only). We set the response Content-Type to text/event-stream and
   * flush each progress event as it's yielded by the service.
   */
  @Post('import')
  @RequirePermissions('can_manage_marketplace_categories')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/json' && !file.originalname.endsWith('.json')) {
          return cb(new BadRequestException('Only JSON files are accepted') as any, false);
        }
        cb(null, true);
      },
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB ceiling
    }),
  )
  async importGpc(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) throw new BadRequestException('No file uploaded');

    // ── Set SSE headers ──
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const write = (event: object) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // Express doesn't auto-flush chunked responses in all envs
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      for await (const event of this.gpcImportService.importFromBuffer(file.buffer)) {
        write(event);
        if (event.phase === 'done' || event.phase === 'error') break;
      }
    } catch (e: any) {
      this.logger.error('SSE stream error', e);
      write({ phase: 'error', message: 'Unexpected error', pct: 0, error: e?.message });
    } finally {
      res.end();
    }
  }

  /** List all GPC taxonomy versions, newest first. */
  @Get('versions')
  @RequirePermissions('can_manage_marketplace_categories')
  async listVersions() {
    return this.gpcImportService.listVersions();
  }

  /** Promote a past release to isCurrent (rollback). */
  @Post('versions/:id/set-current')
  @RequirePermissions('can_manage_marketplace_categories')
  async setCurrentVersion(@Param('id') id: string) {
    return this.gpcImportService.setCurrentVersion(id);
  }
}
