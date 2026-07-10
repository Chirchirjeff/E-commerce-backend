import { Controller, Post, UploadedFiles, UseInterceptors, BadRequestException, Req } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import type { Request } from 'express';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

function filename(req: any, file: any, cb: (err: Error | null, name: string) => void) {
  const rnd = randomBytes(6).toString('hex');
  const name = `${Date.now()}-${rnd}${extname(file.originalname)}`;
  cb(null, name);
}

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({ destination: UPLOAD_DIR, filename }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
          return cb(new BadRequestException('Only images and videos are allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFiles() files: any[], @Req() req: Request) {
    try {
      console.log('[uploads] received files:', files?.length ?? 0);
      if (!files || files.length === 0) {
        throw new BadRequestException('No files uploaded');
      }

      const base = getPublicBaseUrl(req);
      const urls = files.map((f: any) => `${base.replace(/\/$/, '')}/uploads/${f.filename}`);
      console.log('[uploads] returning urls', urls);
      return { files: urls };
    } catch (e) {
      console.error('[uploads] error', e);
      throw e;
    }
  }
}

function getPublicBaseUrl(req: Request) {
  const forwardedProto = req.get('x-forwarded-proto');
  const proto = forwardedProto?.split(',')[0]?.trim() ?? req.protocol ?? 'http';
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost?.split(',')[0]?.trim() ?? req.get('host');

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}
