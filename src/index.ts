import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import { initSocket } from './socket/index.js';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Set JWT_SECRET in your .env to avoid token signature mismatches.');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use('/api/auth', authRoutes);
import usersRoutes from './routes/users.js';
import groupsRoutes from './routes/groups.js';
import chatsRoutes from './routes/chats.js';
import statusRoutes from './routes/status.js';

app.use('/api/users', usersRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/status', statusRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

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
