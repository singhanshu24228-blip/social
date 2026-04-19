import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwt.js';

function getTokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  const cookieToken = (req as Request & { cookies?: { access_token?: string } }).cookies?.access_token;
  return cookieToken ? String(cookieToken) : null;
}

function getRateLimitKey(req: Request): string {
  const token = getTokenFromRequest(req);

  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { id?: string };
      if (payload?.id) {
        return `user:${payload.id}`;
      }
    } catch {
      // Invalid or expired auth should fall back to IP-based limiting.
    }
  }

  return `ip:${req.ip}`;
}

// export const usernameCheckLimiter = rateLimit({
//   windowMs: 60 * 1000, // 1 minute
//   max: 20, // limit each IP to 20 requests per windowMs
//   // message: { message: 'Too many username checks from this IP, please try again later.' },
//   message: { message: 'please try again later.' },
// });

// export const perUserRateLimiter = rateLimit({
//   windowMs: 2 * 60 * 1000, // 2 minutes
//   max: 100, // limit each user ID to 100 requests per windowMs
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: getRateLimitKey,
//   // message: { message: 'Too many requests from this user or IP, please try again later.' },
//   message: { message: 'please try again later.' },
// });
export const usernameCheckLimiter = rateLimit({
  windowMs: Number(process.env.USERNAME_CHECK_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.USERNAME_CHECK_MAX) || 20,
  skip: (req) => req.path === '/health', // Skip health checks
  message: { message: 'Too many username checks, please try again later.' },
});

export const perUserRateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 2 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  keyGenerator: getRateLimitKey,
  skip: (req) => req.path === '/health',
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
// export const authActionLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 60,
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req: Request) => `ip:${req.ip}`,
//   message: { message: 'Too many authentication attempts, please try again later.' },
// });
export const authActionLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `ip:${req.ip}`,
  message: { message: 'Too many authentication attempts, please try again later.' },
  skip: (req) => req.path === '/health',
});