import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createWithdrawalRequest, getMyWithdrawals } from '../controllers/withdrawalsController.js';

const router = express.Router();

router.post('/', requireAuth, createWithdrawalRequest);
router.get('/me', requireAuth, getMyWithdrawals);

export default router;

