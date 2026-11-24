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

/**
 * Uploads a profile photo, cropped server-side to a 512px square centred on
 * the face so every client can render it as a circle without extra work.
 * Returns the delivery URL and the public id (needed to delete it later).
 */
export function uploadAvatarToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 512, height: 512, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'jpg' },
        ],
      },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload failed'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/** Public id of a Cloudinary delivery URL, or null if it is not one of ours. */
export function cloudinaryPublicId(url: string): string | null {
  const m = url.match(
    /res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]*,[^/]*\/)*(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i,
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/** Best-effort delete; a failure only leaves an orphaned image behind. */
export async function destroyCloudinaryImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch {
    /* ignore */
  }
}
