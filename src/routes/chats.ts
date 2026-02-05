import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendPrivateMessage, getPrivateMessages, updatePrivateMessageStatus, addMessageReaction, deletePrivateMessage, getConversationList } from '../controllers/chatController.js';

const router = express.Router();

router.post('/private/send', requireAuth, sendPrivateMessage);
router.get('/private/:userId', requireAuth, getPrivateMessages);
router.patch('/private/:messageId/status', requireAuth, updatePrivateMessageStatus);
router.post('/private/:messageId/reaction', requireAuth, addMessageReaction);
router.delete('/private/:messageId', requireAuth, deletePrivateMessage);
router.get('/conversations/list', requireAuth, getConversationList);

export default router;
