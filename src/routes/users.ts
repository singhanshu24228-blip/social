import express from 'express';
import { updateLocation, checkUsername, getNearbyUsers, findUsersByUsername, getUserProfile } from '../controllers/usersController.js';
import { requireAuth } from '../middleware/auth.js';
import { usernameCheckLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.put('/location', requireAuth, updateLocation);
router.get('/check-username', usernameCheckLimiter, checkUsername);
router.get('/nearby', usernameCheckLimiter, getNearbyUsers);
router.get('/find', requireAuth, usernameCheckLimiter, findUsersByUsername);
router.get('/profile/:id', requireAuth, getUserProfile);

export default router;
