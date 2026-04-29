import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Group from '../models/Group.js';
import GroupMessage from '../models/GroupMessage.js';
import PrivateMessage from '../models/PrivateMessage.js';
import Room from '../models/Room.js';
import { getJwtSecret } from '../utils/jwt.js';

export let ioInstance: Server | null = null;

type NightRoomStreamState = {
  roomId: string;
  streamerSocketId: string;
  streamerUserId: string;
};

const nightRoomStreams = new Map<string, Map<string, NightRoomStreamState>>();

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
  const normalizeOrigin = (s: string) => s.trim().replace(/\/+$/, '');
  const allowedOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
  if (isProd && allowedOrigins.length === 0) {
    throw new Error('CLIENT_URL missing (required in production for Socket.IO CORS)');
  }

  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(normalizeOrigin(origin))) return cb(null, true);
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

    (socket.data as any).nightRooms = new Set<string>();

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

    // Night rooms (Night Mode) subscription + WebRTC signaling
    socket.on('nightroom:join', async (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        if (!roomId) return;

        const room = await Room.findById(roomId).select('participants').lean();
        if (!room) return;
        const isParticipant = (room.participants || []).some((p: any) => String(p) === String(userId));
        if (!isParticipant) return;

        socket.join(`nightroom:${roomId}`);
        (socket.data as any).nightRooms.add(roomId);
        socket.emit('nightroom:joined', { roomId });

        const existing = nightRoomStreams.get(roomId);
        if (existing) {
          for (const stream of existing.values()) {
            socket.emit('nightroom:stream:announce', stream);
          }
        }
      } catch (err) {
        console.error('nightroom:join failed', err);
      }
    });

    socket.on('nightroom:leave', (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        if (!roomId) return;
        socket.leave(`nightroom:${roomId}`);
        (socket.data as any).nightRooms?.delete?.(roomId);
      } catch (err) {
        console.error('nightroom:leave failed', err);
      }
    });

    socket.on('nightroom:stream:start', async (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        if (!roomId) return;

        const room = await Room.findById(roomId).select('creator participants').lean();
        if (!room) return;
        const isParticipant = (room.participants || []).some((p: any) => String(p) === String(userId));
        if (!isParticipant) return;
        // All participants can stream in Study Mode (matches REST canSendMediaInRoom)

        // Ensure streamer is in the night room channel even if they clicked "Start" quickly.
        socket.join(`nightroom:${roomId}`);
        (socket.data as any).nightRooms.add(roomId);

        const state: NightRoomStreamState = {
          roomId,
          streamerSocketId: socket.id,
          streamerUserId: String(userId),
        };
        const roomStreams = nightRoomStreams.get(roomId) || new Map<string, NightRoomStreamState>();
        roomStreams.set(socket.id, state);
        nightRoomStreams.set(roomId, roomStreams);
        io.to(`nightroom:${roomId}`).emit('nightroom:stream:announce', state);
      } catch (err) {
        console.error('nightroom:stream:start failed', err);
      }
    });

    socket.on('nightroom:stream:stop', (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        if (!roomId) return;
        const roomStreams = nightRoomStreams.get(roomId);
        if (!roomStreams?.has(socket.id)) return;
        roomStreams.delete(socket.id);
        if (roomStreams.size === 0) {
          nightRoomStreams.delete(roomId);
        }
        io.to(`nightroom:${roomId}`).emit('nightroom:stream:stop', { roomId, streamerSocketId: socket.id });
      } catch (err) {
        console.error('nightroom:stream:stop failed', err);
      }
    });

    socket.on('nightroom:stream:viewer-ready', (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        const streamerSocketId = String(payload?.streamerSocketId || '');
        if (!roomId || !streamerSocketId) return;
        if (!(socket.data as any).nightRooms?.has?.(roomId)) return;

        const existing = nightRoomStreams.get(roomId)?.get(streamerSocketId);
        if (!existing) return;

        io.to(existing.streamerSocketId).emit('nightroom:stream:viewer-ready', {
          roomId,
          viewerSocketId: socket.id,
          viewerUserId: String(userId),
        });
      } catch (err) {
        console.error('nightroom:stream:viewer-ready failed', err);
      }
    });

    socket.on('nightroom:stream:offer', (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        const targetSocketId = String(payload?.targetSocketId || '');
        const sdp = payload?.sdp;
        if (!roomId || !targetSocketId || !sdp) return;
        if (!(socket.data as any).nightRooms?.has?.(roomId)) return;

        const existing = nightRoomStreams.get(roomId)?.get(socket.id);
        if (!existing) return;

        io.to(targetSocketId).emit('nightroom:stream:offer', {
          roomId,
          fromSocketId: socket.id,
          sdp,
        });
      } catch (err) {
        console.error('nightroom:stream:offer failed', err);
      }
    });

    socket.on('nightroom:stream:answer', (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        const targetSocketId = String(payload?.targetSocketId || '');
        const sdp = payload?.sdp;
        if (!roomId || !targetSocketId || !sdp) return;
        if (!(socket.data as any).nightRooms?.has?.(roomId)) return;

        io.to(targetSocketId).emit('nightroom:stream:answer', {
          roomId,
          fromSocketId: socket.id,
          sdp,
        });
      } catch (err) {
        console.error('nightroom:stream:answer failed', err);
      }
    });

    socket.on('nightroom:stream:ice', (payload: any) => {
      try {
        const roomId = String(payload?.roomId || '');
        const targetSocketId = String(payload?.targetSocketId || '');
        const candidate = payload?.candidate;
        if (!roomId || !targetSocketId || !candidate) return;
        if (!(socket.data as any).nightRooms?.has?.(roomId)) return;

        io.to(targetSocketId).emit('nightroom:stream:ice', {
          roomId,
          fromSocketId: socket.id,
          candidate,
        });
      } catch (err) {
        console.error('nightroom:stream:ice failed', err);
      }
    });

    // Handle sending message to group
    socket.on('group:message', async (payload: any) => {
      try {
        const { groupId, message, mediaUrl, mediaType, localId, isVoice, voiceGender, e2ee } = payload || {};
        const trimmedMessage = String(message || '').trim();
        const hasE2EE = Boolean(
          e2ee &&
          typeof e2ee === 'object' &&
          e2ee.ciphertext &&
          e2ee.nonce &&
          Array.isArray(e2ee.recipients) &&
          e2ee.recipients.length > 0
        );
        if (!groupId || (!hasE2EE && !trimmedMessage && !mediaUrl)) {
          socket.emit('group:message:error', { message: 'Missing group ID or message content' });
          return;
        }
        if (trimmedMessage && !hasE2EE) {
          socket.emit('group:message:error', { message: 'Plaintext group messages are disabled. Encrypted chat is required.' });
          return;
        }
        if (isVoice) {
          socket.emit('group:message:error', { message: 'Voice messages are not supported in mandatory encrypted chat.' });
          return;
        }
        const group = await Group.findById(groupId).select('members groupName');
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
        if (isVoice && trimmedMessage && voiceGender) {
          try {
            const { textToSpeech } = await import('../utils/yourVoiceAI.js');
            voiceUrl = await textToSpeech({
              text: trimmedMessage,
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
          message: hasE2EE ? undefined : trimmedMessage,
          e2ee: hasE2EE
            ? {
                v: Number(e2ee.v || 1),
                alg: String(e2ee.alg || ''),
                nonce: String(e2ee.nonce),
                ciphertext: String(e2ee.ciphertext),
                senderKeyId: e2ee.senderKeyId ? String(e2ee.senderKeyId) : undefined,
                recipients: (e2ee.recipients || []).map((recipient: any) => ({
                  userId: recipient.userId,
                  receiverKeyId: recipient.receiverKeyId ? String(recipient.receiverKeyId) : undefined,
                  nonce: String(recipient.nonce || ''),
                  wrappedKey: String(recipient.wrappedKey || ''),
                })),
              }
            : undefined,
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
          e2ee: (gm as any).e2ee || undefined,
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

        // Create notifications for other members (so they appear in the in-app notifications panel).
        // Safety: cap fanout to avoid accidental DB floods in very large groups.
        try {
          const { createNotification } = await import('../controllers/notificationController.js');
          const members: string[] = (group.members || []).map((m: any) => String(m));
          const targets = members.filter((m) => m && m !== String(userId)).slice(0, 200);

          const preview =
            (gm as any).e2ee?.ciphertext ? '[Encrypted message]' : (voiceUrl ? `[Voice] ${trimmedMessage || ''}` : (trimmedMessage || '[Media message]'));
          const content = group.groupName ? `[${group.groupName}] ${preview}` : preview;

          await Promise.all(
            targets.map((uid) => createNotification(uid, String(userId), 'message', content))
          );
        } catch (nerr) {
          console.warn('Failed to create group message notifications', nerr);
        }
      } catch (err) {
        console.error('group:message failed', err);
        // notify sender about failure
        try { socket.emit('group:message:error', { message: 'Failed to send message' }); } catch(e){}
      }
    });

    // Handle private messaging
    socket.on('private:message', async (payload: any) => {
      try {
        const { toUserId, message, mediaUrl, mediaType, localId, isVoice, voiceGender, e2ee } = payload || {};
        const trimmedMessage = String(message || '').trim();
        const hasE2EE = Boolean(e2ee && typeof e2ee === 'object' && e2ee.ciphertext && e2ee.nonce);
        if (!toUserId || (!hasE2EE && !trimmedMessage && !mediaUrl)) {
          socket.emit('private:message:error', { message: 'Missing recipient or message content' });
          return;
        }
        if (trimmedMessage && !hasE2EE) {
          socket.emit('private:message:error', { message: 'Plaintext private messages are disabled. Encrypted chat is required.' });
          return;
        }
        if (isVoice) {
          socket.emit('private:message:error', { message: 'Voice messages are not supported in mandatory encrypted chat.' });
          return;
        }
        if (hasE2EE && isVoice) {
          socket.emit('private:message:error', { message: 'Voice messages cannot be end-to-end encrypted' });
          return;
        }

        let voiceUrl = null;

        // If voice message, convert text to speech
        if (!hasE2EE && isVoice && trimmedMessage && voiceGender) {
          try {
            const { textToSpeech } = await import('../utils/yourVoiceAI.js');
            voiceUrl = await textToSpeech({
              text: trimmedMessage,
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
          message: hasE2EE ? undefined : trimmedMessage,
          e2ee: hasE2EE
            ? {
                v: Number(e2ee.v || 1),
                alg: String(e2ee.alg || ''),
                nonce: String(e2ee.nonce),
                ciphertext: String(e2ee.ciphertext),
                senderKeyId: e2ee.senderKeyId ? String(e2ee.senderKeyId) : undefined,
                receiverKeyId: e2ee.receiverKeyId ? String(e2ee.receiverKeyId) : undefined,
              }
            : undefined,
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
          e2ee: (pm as any).e2ee || undefined,
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
          hasE2EE ? '[Encrypted message]' : (voiceUrl ? '[Voice message]' : (message ? 'New message' : '[Media message]')),
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

      // If this socket was streaming in any night room, stop it.
      for (const [roomId, roomStreams] of nightRoomStreams.entries()) {
        if (roomStreams.delete(socket.id)) {
          if (roomStreams.size === 0) {
            nightRoomStreams.delete(roomId);
          }
          io.to(`nightroom:${roomId}`).emit('nightroom:stream:stop', { roomId, streamerSocketId: socket.id });
        }
      }
    });
  });

  return io;
}
