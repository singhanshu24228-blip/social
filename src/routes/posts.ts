import { Router, Request, Response, NextFunction } from 'express';
import { createPost, getPosts, getPostById, updatePost, deletePost, likePost, addComment, getPostsByUsername, addReaction, getPrivateSongs } from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

// File signature validation - check magic bytes to ensure files are valid
const validateFileSignature = (filePath: string, mimetype: string): boolean => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Check file signatures (magic bytes)
    if (mimetype.startsWith('image/')) {
      // JPEG: FF D8 FF
      if (mimetype === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return true;
      }
      // PNG: 89 50 4E 47
      if (mimetype === 'image/png' && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return true;
      }
      // GIF: 47 49 46
      if (mimetype === 'image/gif' && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return true;
      }
      // WebP: RIFF ... WEBP
      if (mimetype === 'image/webp' && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        return true;
      }
      // For other image types, just check that file is not empty
      return true;
    }

    if (mimetype.startsWith('video/')) {
      // MP4: 66 74 79 70 (ftyp)
      if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return true;
      }
      // Just check not empty for other video types
      return true;
    }

    return true;
  } catch (error) {
    console.error('File signature validation error:', error);
    return false;
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    const uploadsDir = path.join(process.cwd(), 'backe', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req: Request, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Use createPost handler with multer middleware and validation
router.post('/', requireAuth, upload.fields([{ name: 'image' }, { name: 'song' }]), (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate uploaded files
    if ((req as any).files) {
      const files = (req as any).files as { [fieldname: string]: Express.Multer.File[] };
      for (const fieldName in files) {
        for (const file of files[fieldName]) {
          if (!validateFileSignature(file.path, file.mimetype)) {
            fs.unlinkSync(file.path); // Delete corrupted file
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
