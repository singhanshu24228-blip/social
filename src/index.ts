import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import { initSocket } from './socket/index.js';
import usersRoutes from './routes/users.js';
import groupsRoutes from './routes/groups.js';
import chatsRoutes from './routes/chats.js';
import statusRoutes from './routes/status.js';
import postsRoutes from './routes/posts.js';
import notificationsRoutes from './routes/notifications.js';
import nightModeRoutes from './routes/nightMode.js';
import uploadRoutes from './routes/upload.js';
import debugRoutes from './routes/debug.js';
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { frontendDistDir, uploadsDir, legacyUploadsDir } from './utils/paths.js';

export function createApp() {
  const isProd = process.env.NODE_ENV === 'production';
  const clientUrl = process.env.CLIENT_URL?.trim();
  const debugUploads = !isProd && process.env.DEBUG_UPLOADS?.trim() === 'true';

  if (isProd && !clientUrl) {
    throw new Error('CLIENT_URL missing (required in production for CORS/cookies)');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET missing');
  }

  const app = express();
  app.disable('x-powered-by');

  if (process.env.TRUST_PROXY?.trim()) {
    const trustProxy = Number(process.env.TRUST_PROXY);
    if (!Number.isNaN(trustProxy)) {
      app.set('trust proxy', trustProxy);
    }
  } else if (isProd) {
    app.set('trust proxy', 1);
  }
app.use(helmet());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
  })
);
  app.use(
    cors({
      credentials: true,
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
    })
  );

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  app.use(express.static(frontendDistDir));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 60,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', usersRoutes);
  if (!isProd) {
    app.use('/api/debug', debugRoutes);
  }

  app.use('/api/groups', groupsRoutes);
  app.use('/api/chats', chatsRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/posts', postsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/night-mode', nightModeRoutes);
  app.use('/api/upload', uploadRoutes);

  if (debugUploads) {
    app.use('/uploads', (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(
          `[uploads] ${req.method} ${req.originalUrl} ${res.statusCode} took ${Date.now() - start}ms`
        );
      });
      next();
    });
  }

  const uploadsStaticOptions: any = {
    fallthrough: false,
    setHeaders: (res: any, filePath: string, _stat: any) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Helmet defaults to `Cross-Origin-Resource-Policy: same-origin`, which blocks
      // loading uploaded images/videos from a different origin (e.g. dev frontend on :5173).
      // Uploads are public assets, so allow them to be embedded cross-origin.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        // Back-compat: some older uploads were saved with .heic/.heif extensions even when bytes were JPEG.
        // Serve as JPEG so browsers render them (we also set `nosniff`).
        '.heic': 'image/jpeg',
        '.heif': 'image/jpeg',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.m4a': 'audio/mp4',
        '.mp3': 'audio/mpeg',
      };

      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext]);
      }

      if (clientUrl) {
        res.setHeader('Access-Control-Allow-Origin', clientUrl);
        res.setHeader('Vary', 'Origin');
      } else if (!isProd) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }

      if (process.env.DISABLE_UPLOADS_CACHE?.trim() === 'true') {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate');
        res.setHeader('Vary', 'Accept-Encoding');
      }
    },
    dotfiles: 'deny',
    redirect: false,
    etag: true,
  };

  if (process.env.DISABLE_UPLOADS_CACHE?.trim() === 'true') {
    uploadsStaticOptions.etag = false;
    uploadsStaticOptions.lastModified = false;
  }

  // Serve uploads from the canonical directory only (backe/uploads).
  // Avoid using the legacy repo-root uploads path to prevent ambiguous lookups
  // which can cause HTML fallbacks to be served as images.
  const primary = express.static(uploadsDir, { ...uploadsStaticOptions, fallthrough: false });
  app.use('/uploads', primary);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDistDir, 'index.html'));
  });

  return { app, uploadsDir };
}

export async function createServer() {
  const { app, uploadsDir } = createApp();
  const server = http.createServer(app);

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set');
  }
  const uri = process.env.MONGODB_URI;

  await mongoose.connect(uri);

  try {
    const { migrateRoomCommentIndexes } = await import('./scripts/migrateIndexes.js');
    await migrateRoomCommentIndexes();
  } catch (err) {
    console.warn('Index migration step failed or skipped', err);
  }

  try {
    initSocket(server);
  } catch (err) {
    console.warn('Socket init skipped or failed', err);
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  return server;
}

export async function start() {
  const PORT = process.env.PORT || 5000;
  const server = await createServer();
  server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}
// import dotenv from "dotenv";
// dotenv.config();

// import express from "express";
// import http from "http";
// import cors from "cors";
// import mongoose from "mongoose";
// import path from "path";
// import fs from "fs";
// import cookieParser from "cookie-parser";
// import { fileURLToPath } from "url";

// import authRoutes from "./routes/auth.js";
// import usersRoutes from "./routes/users.js";
// import groupsRoutes from "./routes/groups.js";
// import chatsRoutes from "./routes/chats.js";
// import statusRoutes from "./routes/status.js";
// import postsRoutes from "./routes/posts.js";
// import notificationsRoutes from "./routes/notifications.js";
// import nightModeRoutes from "./routes/nightMode.js";
// import uploadRoutes from "./routes/upload.js";
// import debugRoutes from "./routes/debug.js";

// import { initSocket } from "./socket/index.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// /* ---------------- ENV VALIDATION ---------------- */

// if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
// if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI missing");

// const CLIENT_URL =
//   process.env.CLIENT_URL || "http://localhost:5173";

// /* ---------------- APP INIT ---------------- */

// const app = express();

// app.use(
//   cors({
//     origin: CLIENT_URL,
//     credentials: true,
//   })
// );

// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ limit: "50mb", extended: true }));
// app.use(cookieParser());

// /* ---------------- STATIC FRONTEND ---------------- */

// app.use(
//   express.static(path.join(__dirname, "../../frontend/dist"))
// );

// /* ---------------- ROUTES ---------------- */

// app.use("/api/auth", authRoutes);
// app.use("/api/users", usersRoutes);
// app.use("/api/groups", groupsRoutes);
// app.use("/api/chats", chatsRoutes);
// app.use("/api/status", statusRoutes);
// app.use("/api/posts", postsRoutes);
// app.use("/api/notifications", notificationsRoutes);
// app.use("/api/night-mode", nightModeRoutes);
// app.use("/api/upload", uploadRoutes);

// /* Debug routes only in dev */
// if (process.env.NODE_ENV !== "production") {
//   app.use("/api/debug", debugRoutes);
// }

// /* ---------------- UPLOAD STATIC ---------------- */

// const uploadsPath = path.join(__dirname, "../uploads");

// app.use(
//   "/uploads",
//   express.static(uploadsPath, {
//     dotfiles: "deny",
//     etag: true,
//     setHeaders: (res, filePath, stat) => {
//       res.setHeader("X-Content-Type-Options", "nosniff");
//       res.setHeader("Access-Control-Allow-Origin", CLIENT_URL);

//       if (process.env.DISABLE_UPLOADS_CACHE === "true") {
//         res.setHeader("Cache-Control", "no-store");
//       } else {
//         res.setHeader(
//           "Cache-Control",
//           "public, max-age=604800, must-revalidate"
//         );
//       }
//     },
//   })
// );

// /* ---------------- HEALTH ---------------- */

// app.get("/health", (_, res) => res.json({ ok: true }));

// app.get("*", (_, res) => {
//   res.sendFile(
//     path.join(__dirname, "../../frontend/dist/index.html")
//   );
// });

// /* ---------------- SERVER ---------------- */

// const PORT = process.env.PORT || 5000;
// const server = http.createServer(app);

// async function start() {
//   await mongoose.connect(process.env.MONGODB_URI!);
//   console.log("MongoDB Connected");

//   initSocket(server);

//   if (!fs.existsSync(uploadsPath)) {
//     fs.mkdirSync(uploadsPath, { recursive: true });
//   }

//   server.listen(PORT, () =>
//     console.log(`Server running on ${PORT}`)
//   );
// }

// start().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });
