import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../utils/jwt.js';

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

    const token = jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user._id, username, name, email } });
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

    const token = jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
