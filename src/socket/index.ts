import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Group from '../models/Group.js';
import GroupMessage from '../models/GroupMessage.js';
import PrivateMessage from '../models/PrivateMessage.js';
import { getJwtSecret } from '../utils/jwt.js';

export let ioInstance: Server | null = null;

export function initSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || '*' },
  });

  ioInstance = io;

  io.use(async (socket: Socket, next) => {
    try {
      // Accept token via Authorization header (for Node clients) or handshake auth (browsers)
      let token: string | undefined;
      const headerAuth = socket.handshake.headers.authorization;
      if (headerAuth && headerAuth.startsWith('Bearer ')) {
        token = headerAuth.replace('Bearer ', '');
      } else if ((socket.handshake as any).auth && (socket.handshake as any).auth.token) {
        token = (socket.handshake as any).auth.token;
      }
      if (!token) return next(new Error('Authentication error'));
      const payload: any = jwt.verify(token, getJwtSecret());
      (socket as any).userId = payload.id;
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
        const { groupId, message, mediaUrl, mediaType, localId } = payload || {};
        if (!groupId || (!message && !mediaUrl)) return;
        const group = await Group.findById(groupId).select('members');
        if (!group) return;
        const isMember = group.members.some((m: any) => String(m) === String(userId));
        if (!isMember) return;

        // Save message
        const gm = new GroupMessage({ groupId, senderId: userId, message, mediaUrl, mediaType });
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
        const { toUserId, message, mediaUrl, mediaType, localId } = payload || {};
        if (!toUserId || (!message && !mediaUrl)) return;

        // save message
        const pm = new PrivateMessage({ senderId: userId, receiverId: toUserId, message, mediaUrl, mediaType });
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
          status: pm.status,
          createdAt: pm.createdAt,
          localId: localId || undefined,
        };

        // emit to receiver
        io.to(`user:${toUserId}`).emit('private:message', out);
        // emit to sender's sockets (other tabs) so they see the same message
        io.to(`user:${userId}`).emit('private:message', out);
        // ack the current socket so optimistic UI can be reconciled
        socket.emit('private:message:sent', out);
      } catch (err) {
        console.error('private:message failed', err);
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
        io.to(`user:${payload.toUserId}`).emit('typing', { from: userId });
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
