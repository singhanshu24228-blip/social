import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listAvailableGroups, joinGroup, leaveGroup, getGroupMessages } from '../controllers/groupController.js';

const router = express.Router();

router.get('/available', requireAuth, listAvailableGroups);
router.post('/:groupId/join', requireAuth, joinGroup);
router.post('/:groupId/leave', requireAuth, leaveGroup);
router.get('/:groupId/messages', requireAuth, getGroupMessages);

export default router;