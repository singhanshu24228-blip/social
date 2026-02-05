import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', requireAuth, getNotifications);
router.patch('/:notificationId/read', requireAuth, markAsRead);
router.patch('/read-all', requireAuth, markAllAsRead);
router.delete('/:notificationId', requireAuth, deleteNotification);
router.delete('/delete-all', requireAuth, deleteAllNotifications);

export default router;
