import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createStatus, listNearbyStatuses, deleteStatus, recordView, getStatusById } from '../controllers/statusController.js';

const router = express.Router();

router.post('/', requireAuth, createStatus);
router.get('/nearby', requireAuth, listNearbyStatuses);
router.post('/:id/view', requireAuth, recordView);
router.get('/:id', requireAuth, getStatusById);
router.delete('/:id', requireAuth, deleteStatus);

export default router; 
