import { Response } from 'express';
import Notification from '../models/Notification.js';
import { AuthRequest } from '../middleware/auth.js';
import { ioInstance } from '../socket/index.js';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;

    const notifications = await Notification.find({ userId })
      .populate('fromUser', 'username name profilePicture')
      .populate('postId', 'content')
      .populate('commentId', 'content')
      .sort({ createdAt: -1 })
      .allowDiskUse(true)
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    const total = await Notification.countDocuments({ userId });
    const unread = await Notification.countDocuments({ userId, isRead: false });

    res.json({ notifications, total, unread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    res.json({ ok: true, notification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndDelete(notificationId);

    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAllNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id;

    await Notification.deleteMany({ userId });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createNotification = async (
  userId: string,
  fromUser: string,
  type: string,
  content?: string,
  postId?: string,
  commentId?: string,
  messageId?: string
) => {
  try {
    console.log(`Creating ${type} notification for user ${userId} from ${fromUser}`);
    
    const notification = new Notification({
      userId,
      fromUser,
      type,
      content,
      postId,
      commentId,
      messageId,
    });

    await notification.save();
    const populated = await notification.populate('fromUser', 'username name profilePicture');

    console.log(`Emitting notification to room user:${userId}`);
    
    // Emit to user via Socket.io
    ioInstance?.to(`user:${userId}`).emit('notification:new', {
      _id: notification._id,
      type,
      content,
      fromUser: populated.fromUser,
      createdAt: notification.createdAt,
      isRead: false,
    });

    return notification;
  } catch (err) {
    console.error('Failed to create notification', err);
  }
};
