import { v2 as cloudinary } from 'cloudinary';

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

// configure cloudinary if env vars are present
if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const isCloudinaryConfigured = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
);

export const uploadFileToCloudinary = async (
  filePath: string,
  options?: {
    publicId?: string;
    resourceType?: 'auto' | 'image' | 'video';
  }
) => {
  // if not configured, throw so callers can fallback
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary not configured');
  }
  const opts: any = { resource_type: options?.resourceType || 'auto' };
  if (options?.publicId) opts.public_id = options.publicId;

  return cloudinary.uploader.upload(filePath, opts);
};
