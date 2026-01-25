import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendPrivateMessage, getPrivateMessages, updatePrivateMessageStatus } from '../controllers/chatController.js';

const router = express.Router();

router.post('/private/send', requireAuth, sendPrivateMessage);
router.get('/private/:userId', requireAuth, getPrivateMessages);
router.patch('/private/:messageId/status', requireAuth, updatePrivateMessageStatus);

export default router;
