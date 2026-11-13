import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary and return the secure URL.
 */
function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  mimetype: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const resourceType = mimetype.startsWith('video/') ? 'video' : 'image';

    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload failed'));
        }
        resolve(result.secure_url);
      },
    );

    stream.end(buffer);
  });
}

@Controller('uploads')
export class UploadsController {
  @SkipGuard()
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      // Use memory storage — no disk writes, works on ephemeral filesystems
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (
          !file.mimetype.startsWith('image/') &&
          !file.mimetype.startsWith('video/')
        ) {
          return cb(
            new BadRequestException('Only images and videos are allowed') as any,
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB per file
      },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const folder = process.env.CLOUDINARY_FOLDER ?? 'quza';

    const urls = await Promise.all(
      files.map((file) =>
        uploadToCloudinary(file.buffer, folder, file.mimetype),
      ),
    );

    return { files: urls };
  }
}
