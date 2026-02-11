import {  Response } from 'express';
import PrivateMessage from '../models/PrivateMessage.js';
import { AuthRequest } from '../middleware/auth.js';
import { ioInstance } from '../socket/index.js';
import { createNotification } from './notificationController.js';
import { textToSpeech } from '../utils/yourVoiceAI.js';

export const sendPrivateMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { toUserId, message, mediaUrl, mediaType, isVoice, voiceGender, localId } = req.body;
    const senderId = req.user._id;
    
    console.log('Sending message:', { toUserId, message, isVoice, voiceGender });
    
    if (!toUserId || (!message && !mediaUrl)) return res.status(400).json({ message: 'Missing fields' });

    let voiceUrl = null;

    // If voice message, convert text to speech
    if (isVoice && message && voiceGender) {
      try {
        const result = await textToSpeech({
          text: message,
          gender: voiceGender,
          language: 'en',
        });
        if (result) {
          voiceUrl = result;
        }
      } catch (voiceErr) {
        console.error('Voice conversion error:', voiceErr);
        // Continue without voice if conversion fails
      }
    }

    const pm = new PrivateMessage({ 
      senderId, 
      receiverId: toUserId, 
      message, 
      mediaUrl, 
      mediaType,
      voiceUrl,
      voiceGender: isVoice && voiceUrl ? voiceGender : null,
    });
    
    console.log('Saving message to database...');
    await pm.save();
    console.log('Message saved:', pm._id);

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
      voiceUrl: pm.voiceUrl,
      voiceGender: pm.voiceGender,
      status: pm.status,
      reactions: pm.reactions || [],
      createdAt: pm.createdAt,
      localId: localId || undefined,
    };

    // Create notification for receiver
    await createNotification(
      toUserId,
      senderId,
      'message',
      voiceUrl ? `[Voice message] ${message}` : (message || '[Media message]'),
      undefined,
      undefined,
      String(pm._id)
    );

    // emit to receiver
    ioInstance?.to(`user:${toUserId}`).emit('private:message', out);
    // emit to sender's OTHER sockets (so they see the message in other tabs/windows)
    ioInstance?.to(`user:${senderId}`).emit('private:message:sent', out);

    res.json({ ok: true, message: out });
  } catch (err) {
    console.error('sendPrivateMessage error:', err);
    res.status(500).json({ message: 'Server error', error: String(err) });
  }
};

export const getPrivateMessages = async (req: AuthRequest, res: Response) => {
  try {
    const otherUserId = req.params.userId;
    const userId = req.user._id;

    if (!otherUserId) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    let msgs;
    try {
      msgs = await PrivateMessage.find({
        $or: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
        isDeleted: false,
      })
        .sort({ createdAt: 1 })
        .populate('senderId', 'username name profilePicture')
        .populate('receiverId', 'username name profilePicture')
        .lean();
    } catch (dbError: any) {
      if (dbError.name === 'CastError' && dbError.path === 'senderId') {
        return res.status(400).json({ message: 'Invalid user ID' });
      }
      throw dbError;
    }

    const out = msgs.map((m: any) => ({
      id: m._id,
      senderId: m.senderId?._id || m.senderId,
      sender: m.senderId ? { id: m.senderId._id, username: m.senderId.username, name: m.senderId.name, profilePicture: m.senderId.profilePicture } : undefined,
      receiverId: m.receiverId?._id || m.receiverId,
      receiver: m.receiverId ? { id: m.receiverId._id, username: m.receiverId.username, name: m.receiverId.name, profilePicture: m.receiverId.profilePicture } : undefined,
      message: m.message,
      voiceUrl: m.voiceUrl,
      voiceGender: m.voiceGender,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      status: m.status,
      reactions: m.reactions || [],
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

export const addMessageReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    if (!messageId || !emoji) return res.status(400).json({ message: 'Missing fields' });

    const pm = await PrivateMessage.findById(messageId);
    if (!pm) return res.status(404).json({ message: 'Message not found' });

    // Remove if already exists
    pm.reactions = pm.reactions?.filter((r: any) => !(r.userId?.toString() === req.user._id.toString() && r.emoji === emoji)) || [];
    // Add reaction
    pm.reactions?.push({ emoji, userId: req.user._id });
    await pm.save();

    // Notify both users
    ioInstance?.to(`user:${pm.senderId}`).emit('message:reaction', { messageId, emoji, userId: req.user._id, reactions: pm.reactions });
    ioInstance?.to(`user:${pm.receiverId}`).emit('message:reaction', { messageId, emoji, userId: req.user._id, reactions: pm.reactions });

    res.json({ ok: true, reactions: pm.reactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deletePrivateMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    if (!messageId) return res.status(400).json({ message: 'Missing fields' });

    const pm = await PrivateMessage.findById(messageId);
    if (!pm) return res.status(404).json({ message: 'Message not found' });
    if (pm.senderId.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Unauthorized' });

    pm.isDeleted = true;
    await pm.save();

    // Notify both users
    ioInstance?.to(`user:${pm.senderId}`).emit('message:deleted', { messageId });
    ioInstance?.to(`user:${pm.receiverId}`).emit('message:deleted', { messageId });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getConversationList = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id;
    const User = (await import('../models/User.js')).default;

    // Get all conversations with last message
    const conversations = await PrivateMessage.aggregate([
      {
        $match: {
          $or: [
            { senderId: userId },
            { receiverId: userId }
          ],
          isDeleted: false,
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$senderId', userId] },
              '$receiverId',
              '$senderId'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          lastMessageTime: { $first: '$createdAt' },
        }
      },
      {
        $sort: { lastMessageTime: -1 }
      },
      {
        $limit: 50
      }
    ]);

    const result = await Promise.all(
      conversations.map(async (conv: any) => {
        const otherUser = await User.findById(conv._id).select('username name profilePicture isOnline').lean();
        return {
          userId: conv._id,
          user: otherUser,
          lastMessage: conv.lastMessage.message || (conv.lastMessage.voiceUrl ? '[Voice]' : '[Media]'),
          lastMessageTime: conv.lastMessageTime,
          messageId: conv.lastMessage._id,
        };
      })
    );

    res.json({ conversations: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
