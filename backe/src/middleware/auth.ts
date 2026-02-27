import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../utils/jwt.js';

export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  let token: string | undefined;
  const tokenFromHeader = Boolean(header && header.startsWith('Bearer '));
  if (tokenFromHeader) token = header!.replace('Bearer ', '');
  // Fallback to cookie-based access token
  const tokenFromCookie = !tokenFromHeader && Boolean((req as any).cookies?.access_token);
  if (!token && tokenFromCookie) token = (req as any).cookies.access_token;

  if (!token) return res.status(401).json({ message: 'No token' });

  try {
    const payload: any = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Invalid token' });
    req.user = user;

    // CSRF protection is only needed for cookie-based auth.
    // For Bearer tokens in the Authorization header, CSRF is not applicable.
    if (tokenFromCookie) {
      const method = (req.method || '').toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
        const csrfCookie = (req as any).cookies?.csrf_token;
        if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
          return res.status(403).json({ message: 'CSRF validation failed' });
        }
      }
    }

    next();
  } catch (err) {
    console.warn('JWT verify failed', err);
    return res.status(401).json({ message: 'Invalid token' });
  }
};
