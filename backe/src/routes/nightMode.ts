import { Router } from 'express';
import {
  enterNightMode,
  exitNightMode,
  getNightModeStatus,
  getNightPosts,
  createNightPost,
  getTimeUntilNightMode,
  deleteNightPost,
  createNightRoom,
  getNightRooms,
  joinNightRoom,
  verifyNightRoomEntryPayment,
  getRoomDetails,
  postRoomComment,
  getRoomComments,
  canSendMediaInRoom,
  addNightPostReaction,
  addNightPostComment,
} from '../controllers/nightModeController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Public endpoint - no auth required
router.get('/time-until-night', getTimeUntilNightMode);

// Protected endpoints - require authentication
router.post('/enter', requireAuth, enterNightMode);
router.post('/exit', requireAuth, exitNightMode);
router.get('/status', requireAuth, getNightModeStatus);
router.get('/posts', requireAuth, getNightPosts);
router.post('/create-post', requireAuth, createNightPost);
router.delete('/posts/:id', requireAuth, deleteNightPost);
router.post('/posts/:id/react', requireAuth, addNightPostReaction);
router.post('/posts/:id/comment', requireAuth, addNightPostComment);
router.post('/rooms', requireAuth, createNightRoom);
router.get('/rooms', requireAuth, getNightRooms);
router.post('/rooms/:id/join', requireAuth, joinNightRoom);
router.post('/rooms/:id/join/verify', requireAuth, verifyNightRoomEntryPayment);
router.get('/rooms/:id', requireAuth, getRoomDetails);
router.post('/rooms/:id/comments', requireAuth, postRoomComment);
router.get('/rooms/:id/comments', requireAuth, getRoomComments);
router.get('/rooms/:id/can-send-media', requireAuth, canSendMediaInRoom);

export default router;
