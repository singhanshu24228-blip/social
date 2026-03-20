import express from 'express';
import {
  getAllWithdrawalRequests,
  getWithdrawalRequestById,
  approveWithdrawalRequest,
  rejectWithdrawalRequest,
  createAdminUser,
  deleteAdminUser,
} from '../controllers/adminController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

// Apply requireAuth and requireAdmin to all admin routes
router.use(requireAuth, requireAdmin);

// Get all withdrawal requests (with optional status filter)
router.get('/withdrawals', getAllWithdrawalRequests);

// Get specific withdrawal request
router.get('/withdrawals/:id', getWithdrawalRequestById);

// Approve a withdrawal request
router.post('/withdrawals/:id/approve', approveWithdrawalRequest);

// Reject a withdrawal request
router.post('/withdrawals/:id/reject', rejectWithdrawalRequest);

// Create another admin account
router.post('/admins', createAdminUser);
// Delete an admin account (requires target admin's credentials)
router.post('/admins/delete', deleteAdminUser);

export default router;
