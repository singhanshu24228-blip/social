import { Router, Request, Response, NextFunction } from 'express';
import { createPost, getPosts, getPostById, updatePost, deletePost, likePost, addComment, getPostsByUsername, addReaction, getPrivateSongs } from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadsDir } from '../utils/paths.js';
import { validateUploadedFile } from '../utils/fileValidation.js';

const router = Router();

const extensionFromMime = (mimetype: string): string => {
  const m = (mimetype || '').toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  if (map[m]) return map[m];
  const parts = m.split('/');
  const subtype = parts[1] || '';
  const safe = subtype.replace(/[^a-z0-9]+/g, '');
  return safe ? `.${safe}` : '';
};

const getUploadExtension = (originalname: string, mimetype: string): string => {
  const ext = path.extname(originalname || '').toLowerCase();
  const validExtensionsForMime: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
  };

  const mimeType = (mimetype || '').toLowerCase();
  const validExts = validExtensionsForMime[mimeType];

  // If extension matches MIME type, use it
  if (ext && validExts && validExts.includes(ext)) {
    return ext;
  }

  // Otherwise, infer from MIME type
  const inferred = extensionFromMime(mimetype);
  if (inferred) return inferred;

  // If no mime match and no original extension, use generic extension
  if (ext) return ext;

  // Last resort: generate an extension based on file type
  if (mimeType.startsWith('image/')) return '.jpg';
  if (mimeType.startsWith('video/')) return '.mp4';

  return '';
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = getUploadExtension(file.originalname, file.mimetype);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req: Request, file: any, cb: any) => {
    const mt = String(file?.mimetype || '').toLowerCase();
    if (mt === 'image/heic' || mt === 'image/heif') {
      cb(new Error('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.'));
      return;
    }

    if (mt.startsWith('image/') || mt.startsWith('video/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only image and video files are allowed'));
  }
});

// Use createPost handler with multer middleware and validation
router.post(
  '/',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    upload.fields([{ name: 'image' }, { name: 'song' }])(req as any, res as any, (err: any) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Upload failed' });
      }
      next();
    });
  },
  (req: Request, res: Response, _next: NextFunction) => {
  try {
    // Validate uploaded files
    if ((req as any).files) {
      const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] };
      for (const fieldName in files) {
        for (const file of files[fieldName]) {
          if (!validateUploadedFile(file.path, file.mimetype)) {
            try {
              fs.unlinkSync(file.path); // best-effort cleanup
            } catch (e) {
              console.warn('[posts] Failed to delete invalid upload:', file.path, e);
            }
            return res.status(400).json({
              message: 'Uploaded file appears to be corrupted or invalid. Please try uploading again.'
            });
          }
        }
      }
    }
    // Proceed to createPost if validation passes
    createPost(req, res);
  } catch (error) {
    console.error('File validation error:', error);
    res.status(500).json({ message: 'File validation failed' });
  }
});
router.get('/', getPosts);
router.get('/private-songs', requireAuth, getPrivateSongs);
router.get('/user/:username', requireAuth, getPostsByUsername);
router.get('/:id', requireAuth, getPostById);
router.put('/:id', requireAuth, updatePost);
router.delete('/:id', requireAuth, deletePost);
router.post('/:id/like', requireAuth, likePost);
router.post('/:id/comment', requireAuth, addComment);
router.post('/:id/react', requireAuth, addReaction);

export default router;
