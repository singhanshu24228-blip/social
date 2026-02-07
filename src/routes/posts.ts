import { Router, Request, Response, NextFunction } from 'express';
import { createPost, getPosts, getPostById, updatePost, deletePost, likePost, addComment, getPostsByUsername, addReaction, getPrivateSongs } from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

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

// Use createPost handler with multer middleware
router.post('/', requireAuth, upload.fields([{ name: 'image' }, { name: 'song' }]), createPost);
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
