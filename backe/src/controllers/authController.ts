import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import { getJwtSecret } from '../utils/jwt.js';

const isProd = process.env.NODE_ENV === 'production';
const ACCESS_TOKEN_EXPIRES = 30 * 24 * 60 * 60; // 30 days in seconds
const REFRESH_TOKEN_EXPIRES = 30 * 24 * 60 * 60; // 30 days in seconds

function setAuthCookies(res: any, user: any, existingRefreshTokenHash?: string) {
  // Create short-lived access token (JWT)
  const accessToken = jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: `${ACCESS_TOKEN_EXPIRES}s` });
  // Set access token cookie
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_EXPIRES * 1000,
  });

  // Create refresh token (opaque random), store hashed in DB
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

  // Save refresh token record (remove any previous if provided)
  if (existingRefreshTokenHash) {
    // remove existing by hash
    RefreshToken.deleteOne({ tokenHash: existingRefreshTokenHash }).catch(() => {});
  }
  const rt = new RefreshToken({ tokenHash: refreshHash, user: user._id, expiresAt });
  rt.save().catch(() => {});

  // Set refresh token cookie (HttpOnly)
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_EXPIRES * 1000,
  });

  // Set CSRF token cookie (not HttpOnly so client JS can read and include in headers)
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_EXPIRES * 1000,
  });

  return { accessToken, refreshToken, refreshHash, csrfToken };
}


export const signup = async (req: Request, res: Response) => {
  try {
    const { username, name, email, phone, password, location } = req.body;

    if (!username || !name || !email || !password || !location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check email uniqueness
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    // Check username uniqueness within 2KM
    const coords: [number, number] = location.coordinates;
    const isAvailable = await (User as any).isUsernameAvailable(username, coords, 2000);
    if (!isAvailable) {
      return res.status(409).json({ message: 'Username already taken within 2 KM' });
    }

    const user = new User({ username, name, email, phone, password, location });
    await user.save();

    // Set cookies (access + refresh + csrf)
    setAuthCookies(res, user);

    res.status(201).json({ user: { id: user._id, username, name, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing credentials' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // Validate username uniqueness within 2 KM using stored location
    if (user.username && user.location && user.location.coordinates) {
      const coords: [number, number] = user.location.coordinates as [number, number];
      const isAvailable = await (User as any).isUsernameAvailable(user.username, coords, 2000, user._id.toString());
      if (!isAvailable) {
        return res.status(409).json({ message: 'Username conflict within 2 KM. Please choose another username.' });
      }
    }

    // Rotate/create new tokens
    setAuthCookies(res, user);
    res.json({ user: { id: user._id, username: user.username, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const rtCookie = req.cookies?.refresh_token;
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
    const csrfCookie = req.cookies?.csrf_token;

    // Require CSRF token match
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return res.status(403).json({ message: 'CSRF validation failed' });
    }

    if (!rtCookie) return res.status(401).json({ message: 'No refresh token' });
    const refreshHash = crypto.createHash('sha256').update(String(rtCookie)).digest('hex');
    const record = await RefreshToken.findOne({ tokenHash: refreshHash }).populate('user');
    if (!record) return res.status(401).json({ message: 'Invalid refresh token' });

    if (new Date() > new Date(record.expiresAt)) {
      await RefreshToken.deleteOne({ _id: record._id });
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    const user = await User.findById(record.user._id);
    if (!user) return res.status(401).json({ message: 'User not found' });

    // Rotate refresh token: delete current and set a new one
    const oldHash = record.tokenHash;
    await RefreshToken.deleteOne({ _id: record._id });
    setAuthCookies(res, user, oldHash);

    res.json({ user: { id: user._id, username: user.username, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Refresh token failed', err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const rtCookie = req.cookies?.refresh_token;
    if (rtCookie) {
      const refreshHash = crypto.createHash('sha256').update(String(rtCookie)).digest('hex');
      await RefreshToken.deleteOne({ tokenHash: refreshHash });
    }
    // Clear cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.clearCookie('csrf_token');
    res.json({ success: true });
  } catch (err) {
    console.error('Logout failed', err);
    res.status(500).json({ message: 'Server error' });
  }
};
