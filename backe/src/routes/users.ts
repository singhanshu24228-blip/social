import express from 'express';
import { updateLocation, checkUsername, getNearbyUsers, getRandomUsers, findUsersByUsername, getUserProfile, followUser, unfollowUser, getFollowing, getFollowers, getFollowingList, updateProfilePicture, updateBio, blockUser, unblockUser, listBlockedUsers } from '../controllers/usersController.js';
import { requireAuth } from '../middleware/auth.js';
import { usernameCheckLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.put('/location', requireAuth, updateLocation);
router.get('/check-username', usernameCheckLimiter, checkUsername);
router.get('/nearby', usernameCheckLimiter, getNearbyUsers);
router.get('/random', requireAuth, usernameCheckLimiter, getRandomUsers);
router.get('/find', requireAuth, usernameCheckLimiter, findUsersByUsername);
router.get('/profile/:id', requireAuth, getUserProfile);
router.get('/followers', requireAuth, getFollowers);
router.get('/following', requireAuth, getFollowing);
router.get('/following-list', requireAuth, getFollowingList);
router.get('/blocked', requireAuth, listBlockedUsers);
router.post('/:id/follow', requireAuth, followUser);
router.post('/:id/unfollow', requireAuth, unfollowUser);
router.post('/:id/block', requireAuth, blockUser);
router.post('/:id/unblock', requireAuth, unblockUser);
router.put('/profile-picture', requireAuth, updateProfilePicture);
router.put('/bio', requireAuth, updateBio);

export default router;
