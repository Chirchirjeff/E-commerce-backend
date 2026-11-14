/**
 * Shared Cloudinary upload utility.
 * Used by UploadsController and both KYC controllers.
 */
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary and return the secure_url.
 * resource_type is auto-detected from the mimetype.
 */
export function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  mimetype: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const resourceType =
      mimetype.startsWith('video/') ? 'video' :
      mimetype === 'application/pdf' ? 'raw' :
      'image';

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
