import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import { initSocket } from './socket/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Set JWT_SECRET in your .env to avoid token signature mismatches.');
}

const app = express();
// app.use(cors());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

app.use('/api/auth', authRoutes);
import usersRoutes from './routes/users.js';
import groupsRoutes from './routes/groups.js';
import chatsRoutes from './routes/chats.js';
import statusRoutes from './routes/status.js';
import postsRoutes from './routes/posts.js';
import notificationsRoutes from './routes/notifications.js';
import nightModeRoutes from './routes/nightMode.js';
import uploadRoutes from './routes/upload.js';

app.use('/api/users', usersRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/night-mode', nightModeRoutes);
app.use('/api/upload', uploadRoutes);

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => res.json({ ok: true }));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

async function start() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/backend';
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // Run index migration to remove old TTL on createdAt and ensure expiresAt TTL
  try {
    const { migrateRoomCommentIndexes } = await import('./scripts/migrateIndexes.js');
    await migrateRoomCommentIndexes();
  } catch (err) {
    console.warn('Index migration step failed or skipped', err);
  }

  // Initialize socket.io
  try {
    initSocket(server);
  } catch (err) {
    console.warn('Socket init skipped or failed', err);
  }

  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
