import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Group from '../models/Group.js';
import GroupMessage from '../models/GroupMessage.js';
import PrivateMessage from '../models/PrivateMessage.js';
import { getJwtSecret } from '../utils/jwt.js';

export let ioInstance: Server | null = null;

export function getTokenFromHandshake(handshake: {
  headers?: Record<string, unknown>;
  auth?: Record<string, unknown>;
}): string | undefined {
  const headerAuth = (handshake.headers as any)?.authorization as string | undefined;
  if (headerAuth && headerAuth.startsWith('Bearer ')) {
    return headerAuth.replace('Bearer ', '');
  }

  const authToken = (handshake as any)?.auth?.token as string | undefined;
  if (authToken) return authToken;

  const cookieHeader = (handshake.headers as any)?.cookie as string | undefined;
  if (cookieHeader) {
    const parts = cookieHeader.split(';').map((p) => p.trim());
    for (const p of parts) {
      if (p.startsWith('access_token=')) {
        return decodeURIComponent(p.substring('access_token='.length));
      }
    }
  }

  return undefined;
}

export function authenticateHandshake(handshake: {
  headers?: Record<string, unknown>;
  auth?: Record<string, unknown>;
}): { userId: string } {
  const token = getTokenFromHandshake(handshake);
  if (!token) throw new Error('Authentication error');
  const payload: any = jwt.verify(token, getJwtSecret());
  if (!payload?.id) throw new Error('Authentication error');
  return { userId: String(payload.id) };
}

export function initSocket(server: HttpServer) {
  const isProd = process.env.NODE_ENV === 'production';
  const clientUrl = process.env.CLIENT_URL?.trim();
  if (isProd && !clientUrl) {
    throw new Error('CLIENT_URL missing (required in production for Socket.IO CORS)');
  }

  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (clientUrl && origin === clientUrl) return cb(null, true);
        if (!isProd) {
          if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
          if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return cb(null, true);
          if (/^http:\/\/\[::1\]:\d+$/.test(origin)) return cb(null, true);
        }
        return cb(new Error(`CORS blocked for origin: ${origin}`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  ioInstance = io;

  io.use(async (socket: Socket, next) => {
    try {
      const { userId } = authenticateHandshake(socket.handshake as any);
      (socket as any).userId = userId;
      next();
    } catch (err) {
      console.error('Socket auth failed', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log('Socket connected:', userId);

    // Set user online
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('presence:update', { userId, isOnline: true });

    // Join personal room
    socket.join(`user:${userId}`);

    // Auto-join group rooms for groups where user is a member
    try {
      const groups = await Group.find({ members: userId }).select('_id').lean();
      groups.forEach((g: any) => socket.join(`group:${g._id}`));
    } catch (err) {
      console.warn('Failed to join group rooms', err);
    }

    // Allow client to subscribe to a group (after joining via API)
    socket.on('group:subscribe', async (payload: any) => {
      try {
        const { groupId } = payload || {};
        if (!groupId) return;
        const group = await Group.findById(groupId).select('members');
        if (!group) return;
        const isMember = group.members.some((m: any) => String(m) === String(userId));
        if (isMember) {
          socket.join(`group:${groupId}`);
          socket.emit('group:subscribed', { groupId });
        }
      } catch (err) {
        console.error('group:subscribe failed', err);
      }
    });

    // Handle sending message to group
    socket.on('group:message', async (payload: any) => {
      try {
        const { groupId, message, mediaUrl, mediaType, localId, isVoice, voiceGender } = payload || {};
        if (!groupId || (!message && !mediaUrl)) {
          socket.emit('group:message:error', { message: 'Missing group ID or message content' });
          return;
        }
        const group = await Group.findById(groupId).select('members');
        if (!group) {
          socket.emit('group:message:error', { message: 'Group not found' });
          return;
        }
        const isMember = group.members.some((m: any) => String(m) === String(userId));
        if (!isMember) {
          socket.emit('group:message:error', { message: 'You are not a member of this group' });
          return;
        }

        let voiceUrl = null;

        // If voice message, convert text to speech
        if (isVoice && message && voiceGender) {
          try {
            const { textToSpeech } = await import('../utils/yourVoiceAI.js');
            voiceUrl = await textToSpeech({
              text: message,
              gender: voiceGender,
              language: 'en',
            });
          } catch (voiceErr) {
            console.error('Voice conversion error:', voiceErr);
            // Continue without voice if conversion fails
          }
        }

        // Save message
        const gm = new GroupMessage({
          groupId,
          senderId: userId,
          message,
          mediaUrl,
          mediaType,
          voiceUrl,
          ...(isVoice && { voiceGender })
        });
        await gm.save();

        // fetch sender info
        const sender = await User.findById(userId).select('username name').lean();

        const out = {
          id: gm._id,
          groupId: String(groupId),
          senderId: userId,
          sender: { id: userId, username: sender?.username, name: sender?.name },
          message: gm.message,
          mediaUrl: gm.mediaUrl,
          mediaType: gm.mediaType,
          voiceUrl: gm.voiceUrl,
          voiceGender: gm.voiceGender,
          createdAt: gm.createdAt,
          localId,
        };

        // emit to group
        io.to(`group:${groupId}`).emit('group:message', out);
        // ack to sender so optimistic UI can be reconciled
        socket.emit('group:message:sent', out);
      } catch (err) {
        console.error('group:message failed', err);
        // notify sender about failure
        try { socket.emit('group:message:error', { message: 'Failed to send message' }); } catch(e){}
      }
    });

    // Handle private messaging
    socket.on('private:message', async (payload: any) => {
      try {
        const { toUserId, message, mediaUrl, mediaType, localId, isVoice, voiceGender } = payload || {};
        if (!toUserId || (!message && !mediaUrl)) {
          socket.emit('private:message:error', { message: 'Missing recipient or message content' });
          return;
        }

        let voiceUrl = null;

        // If voice message, convert text to speech
        if (isVoice && message && voiceGender) {
          try {
            const { textToSpeech } = await import('../utils/yourVoiceAI.js');
            voiceUrl = await textToSpeech({
              text: message,
              gender: voiceGender,
              language: 'en',
            });
          } catch (voiceErr) {
            console.error('Voice conversion error:', voiceErr);
            // Continue without voice if conversion fails
          }
        }

        // save message
        const pm = new PrivateMessage({
          senderId: userId,
          receiverId: toUserId,
          message,
          mediaUrl,
          mediaType,
          voiceUrl,
          ...(isVoice && { voiceGender })
        });
        await pm.save();

        // fetch sender info
        const sender = await User.findById(userId).select('username name').lean();

        const out = {
          id: pm._id,
          senderId: userId,
          sender: { id: userId, username: sender?.username, name: sender?.name },
          receiverId: toUserId,
          message: pm.message,
          mediaUrl: pm.mediaUrl,
          mediaType: pm.mediaType,
          voiceUrl: pm.voiceUrl,
          voiceGender: pm.voiceGender,
          status: pm.status,
          createdAt: pm.createdAt,
          localId: localId || undefined,
        };

        // Create notification for receiver
        const { createNotification } = await import('../controllers/notificationController.js');
        await createNotification(
          toUserId,
          userId,
          'message',
          voiceUrl ? `[Voice message] ${message}` : (message || '[Media message]'),
          undefined,
          undefined,
          String(pm._id)
        );

        // emit to receiver with 'private:message' event
        io.to(`user:${toUserId}`).emit('private:message', out);
        // emit to sender's OTHER sockets (other tabs) with 'private:message' so they see the message
        socket.broadcast.to(`user:${userId}`).emit('private:message', out);
        // ack the current socket with 'private:message:sent' so optimistic UI can be reconciled
        socket.emit('private:message:sent', out);
      } catch (err) {
        console.error('private:message failed', err);
        socket.emit('private:message:error', { message: 'Failed to send message' });
      }
    });

    // Handle message status updates (delivered/seen)
    socket.on('private:status', async (payload: any) => {
      try {
        const { messageId, status } = payload || {};
        if (!messageId || !status) return;
        const pm = await PrivateMessage.findById(messageId);
        if (!pm) return;

        pm.status = status;
        await pm.save();

        // notify sender
        io.to(`user:${pm.senderId}`).emit('private:status', { messageId, status, by: userId });
      } catch (err) {
        console.error('private:status failed', err);
      }
    });

    socket.on('typing', (payload) => {
      // payload: { toUserId }
      if (payload?.toUserId) {
        io.to(`user:${payload.toUserId}`).emit('typing', { from: userId, userId });
      }
    });

    socket.on('disconnect', async () => {
      console.log('Socket disconnected:', userId);
      await User.findByIdAndUpdate(userId, { isOnline: false });
      io.emit('presence:update', { userId, isOnline: false });
    });
  });

  return io;
}
