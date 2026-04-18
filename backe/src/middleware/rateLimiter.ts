import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

export const usernameCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: { message: 'Too many username checks from this IP, please try again later.' },
});

export const perUserRateLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 100, // limit each user ID to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const authReq = req as Request & { user?: { _id?: string } };
    if (authReq.user && authReq.user._id) {
      return String(authReq.user._id);
    }
    return req.ip;
  },
  message: { message: 'Too many requests from this user or IP, please try again later.' },
});
