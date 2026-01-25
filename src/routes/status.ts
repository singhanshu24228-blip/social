import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createStatus, listNearbyStatuses, deleteStatus } from '../controllers/statusController.js';

const router = express.Router();

router.post('/', requireAuth, createStatus);
router.get('/nearby', requireAuth, listNearbyStatuses);
router.delete('/:id', requireAuth, deleteStatus);

export default router; 
