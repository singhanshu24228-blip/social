import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createStatus,
  listNearbyStatuses,
  listFeedStatuses,
  deleteStatus,
  recordView,
  getStatusById,
} from '../controllers/statusController.js';

const router = express.Router();

router.post('/', requireAuth, createStatus);
// `nearby` kept for backwards compatibility; uses follower-based feed logic now
router.get('/nearby', requireAuth, listNearbyStatuses);
// new, clearer endpoint for follower feed
router.get('/feed', requireAuth, listFeedStatuses);
router.post('/:id/view', requireAuth, recordView);
router.get('/:id', requireAuth, getStatusById);
router.delete('/:id', requireAuth, deleteStatus);

export default router; 
