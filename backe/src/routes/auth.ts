import express from 'express';
import { signup, login, refreshToken, logout, forgotPassword, resetPassword, requestDeleteAccount, deleteAccount, requestUsernameChange, changeUsername } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authActionLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/signup', authActionLimiter, signup);
router.post('/login', authActionLimiter, login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
// password reset flow
router.post('/forgot-password', authActionLimiter, forgotPassword);
router.post('/reset-password', authActionLimiter, resetPassword);

// account deletion flow (user must be logged in)
router.post('/request-delete', requireAuth, requestDeleteAccount);
router.delete('/delete-account', requireAuth, deleteAccount);

// username change flow (user must be logged in)
router.post('/request-username-change', requireAuth, requestUsernameChange);
router.post('/change-username', requireAuth, changeUsername);

export default router;
