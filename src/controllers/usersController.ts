import { Request, Response } from 'express';
import User from '../models/User.js';
import { AuthRequest } from '../middleware/auth.js';

export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { location } = req.body;
    if (!location || !Array.isArray(location.coordinates)) return res.status(400).json({ message: 'Invalid location' });

    const coords = location.coordinates as [number, number];
    const userId = req.user._id.toString();
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isAvailable = await (User as any).isUsernameAvailable(user.username, coords, 2000, userId);
    if (!isAvailable) return res.status(409).json({ message: 'Username conflict within 2 KM at this location' });

    user.location = { type: 'Point', coordinates: coords } as any;
    await user.save();
    try {
      const { ensureGroupsForLocation } = require('./groupController');
      await ensureGroupsForLocation(coords, user._id.toString());
    } catch (err) {
      console.warn('Group creation failed', err);
    }
    try {
      const { ioInstance } = require('../socket');
      const groups = await (await import('../models/Group')).default.find({ members: userId }).lean();
      const userCoords = coords;
      const haversine = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) => {
        const R = 6371e3; // meters
        const toRad = (v: number) => (v * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      for (const g of groups) {
        const distance = haversine(userCoords as [number, number], g.location.coordinates as [number, number]);
        const allowed = g.distanceRange === '1KM' ? distance <= 1000 : distance <= 2000;
        if (!allowed) {
          await (await import('../models/Group')).default.findByIdAndUpdate(g._id, { $pull: { members: user._id } });
          ioInstance?.to(`group:${g._id}`).emit('group:member:left', { groupId: g._id, userId: user._id });
          ioInstance?.to(`user:${user._id}`).emit('group:left', { groupId: g._id });
        }
      }
    } catch (err) {
      console.warn('Failed to adjust group membership after location update', err);
    }

    res.json({ ok: true, location: user.location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getNearbyUsers = async (req: Request, res: Response) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'Missing params' });
    const coords: [number, number] = [parseFloat(lng as string), parseFloat(lat as string)];
    const results = await User.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: coords },
          distanceField: 'dist',
          spherical: true,
          maxDistance: 2000,
        },
      },
      {
        $project: {
          password: 0,
          location: 0,
        },
      },
      { $sort: { dist: 1 } },
    ]).limit(100);

    const users = results.map((u: any) => ({
      id: u._id,
      username: u.username,
      name: u.name,
      isOnline: u.isOnline,
      distanceMeters: Math.round(u.dist),
      createdAt: u.createdAt,
    }));

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const checkUsername = async (req: Request, res: Response) => {
  try {
    const { username, lat, lng } = req.query;
    if (!username || !lat || !lng) return res.status(400).json({ message: 'Missing params' });
    const coords: [number, number] = [parseFloat(lng as string), parseFloat(lat as string)];
    const available = await (User as any).isUsernameAvailable(username as string, coords, 2000);
    res.json({ available });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
export const findUsersByUsername = async (req: AuthRequest, res: Response) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string') return res.status(400).json({ message: 'Missing username' });

    const userId = req.user._id;
    const regex = new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({ _id: { $ne: userId }, username: regex }).select('_id username name isOnline').limit(20).lean();

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
