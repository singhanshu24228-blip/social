import { Router } from 'express';
import { createPost, getPosts, getPostById, updatePost, deletePost, likePost, addComment, getPostsByUsername, addReaction, getPrivateSongs } from '../controllers/postsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, createPost);
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
