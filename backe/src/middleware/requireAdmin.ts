import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'No token' });
  }

  if (!(req.user as any).isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};
