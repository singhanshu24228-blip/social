import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
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
import debugRoutes from './routes/debug.js';

app.use('/api/users', usersRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/night-mode', nightModeRoutes);
app.use('/api/upload', uploadRoutes);

// Log requests to uploads and serve uploaded images with proper cache control
app.use('/uploads', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[uploads] ${req.method} ${req.originalUrl} ${res.statusCode} If-Modified-Since:${req.get('if-modified-since') || ''} took ${Date.now() - start}ms`);
  });
  next();
});

// Configure static serving for uploads with mobile-optimized cache headers
const uploadsStaticOptions: any = {
  setHeaders: (res: any, filePath: string) => {
    // Add headers to prevent corruption and improve mobile caching
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Check if file has valid size (avoid serving partially downloaded files)
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        res.setHeader('Content-Length', stats.size.toString());
      }
    } catch (e) {
      console.warn(`Could not stat file ${filePath}:`, e);
    }

    if (process.env.DISABLE_UPLOADS_CACHE === 'true') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // Use conditional caching with ETag for mobile safety
      // This allows browsers to validate cached files instead of blindly using them
      // If file is unchanged, server returns 304 Not Modified without re-downloading
      res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate');
      res.setHeader('Vary', 'Accept-Encoding');
    }
  },
  // Enable compression for better mobile performance
  dotfiles: 'deny',
  redirect: false,
  // Enable ETag for cache validation - critical for mobile reliability
  etag: true
};

// If caching is disabled, also turn off ETag and Last-Modified handling to avoid 304 responses
if (process.env.DISABLE_UPLOADS_CACHE === 'true') {
  uploadsStaticOptions.etag = false;
  uploadsStaticOptions.lastModified = false;
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), uploadsStaticOptions));

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

  // Ensure uploads directory exists so multer can write files on platforms where the directory
  // is not checked into source (Render, Docker, etc.)
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }

  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
