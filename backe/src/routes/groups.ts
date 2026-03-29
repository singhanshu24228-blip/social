import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listAvailableGroups,
  createPublicGroup,
  searchPublicGroups,
  listMyGroups,
  joinPublicGroup,
  joinGroup,
  leaveGroup,
  deleteGroup,
  getGroupMessages,
  getGroupE2EEKeys,
} from '../controllers/groupController.js';

const router = express.Router();

router.get('/available', requireAuth, listAvailableGroups);
router.get('/mine', requireAuth, listMyGroups);
router.post('/public/create', requireAuth, createPublicGroup);
router.get('/public/search', requireAuth, searchPublicGroups);
router.post('/public/:groupId/join', requireAuth, joinPublicGroup);
router.post('/:groupId/join', requireAuth, joinGroup);
router.post('/:groupId/leave', requireAuth, leaveGroup);
router.delete('/:groupId', requireAuth, deleteGroup);
router.get('/:groupId/e2ee-keys', requireAuth, getGroupE2EEKeys);
router.get('/:groupId/messages', requireAuth, getGroupMessages);

export default router;
