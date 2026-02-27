import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { reportPost, reportUser } from '../controllers/reportsController.js';

const router = Router();

router.post('/post/:postId', requireAuth, reportPost);
router.post('/user/:userId', requireAuth, reportUser);

export default router;

