import { Request, Response } from 'express';
import PrivateMessage from '../models/PrivateMessage.js';
import { AuthRequest } from '../middleware/auth.js';
import { ioInstance } from '../socket/index.js';

export const sendPrivateMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { toUserId, message, mediaUrl, mediaType, localId } = req.body;
    const senderId = req.user._id;
    if (!toUserId || (!message && !mediaUrl)) return res.status(400).json({ message: 'Missing fields' });

    const pm = new PrivateMessage({ senderId, receiverId: toUserId, message, mediaUrl, mediaType });
    await pm.save();

    // fetch sender info
    const User = (await import('../models/User.js')).default;
    const sender = await User.findById(senderId).select('username name').lean();

    const out = {
      id: pm._id,
      senderId,
      sender: { id: senderId, username: sender?.username, name: sender?.name },
      receiverId: toUserId,
      message: pm.message,
      mediaUrl: pm.mediaUrl,
      mediaType: pm.mediaType,
      status: pm.status,
      createdAt: pm.createdAt,
      localId: localId || undefined,
    };

    // emit to receiver and sender sockets
    ioInstance?.to(`user:${toUserId}`).emit('private:message', out);
    ioInstance?.to(`user:${senderId}`).emit('private:message', out);

    res.json({ ok: true, message: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPrivateMessages = async (req: AuthRequest, res: Response) => {
  try {
    const otherUserId = req.params.userId;
    const userId = req.user._id;

    const msgs = await PrivateMessage.find({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate('senderId', 'username name')
      .populate('receiverId', 'username name')
      .lean();

    const out = msgs.map((m: any) => ({
      id: m._id,
      senderId: m.senderId?._id || m.senderId,
      sender: m.senderId ? { id: m.senderId._id, username: m.senderId.username, name: m.senderId.name } : undefined,
      receiverId: m.receiverId?._id || m.receiverId,
      receiver: m.receiverId ? { id: m.receiverId._id, username: m.receiverId.username, name: m.receiverId.name } : undefined,
      message: m.message,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      status: m.status,
      createdAt: m.createdAt,
    }));

    res.json({ messages: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePrivateMessageStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;
    if (!messageId || !status) return res.status(400).json({ message: 'Missing fields' });

    const pm = await PrivateMessage.findById(messageId);
    if (!pm) return res.status(404).json({ message: 'Message not found' });

    pm.status = status;
    await pm.save();

    // notify sender
    ioInstance?.to(`user:${pm.senderId}`).emit('private:status', { messageId, status, by: req.user._id });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};