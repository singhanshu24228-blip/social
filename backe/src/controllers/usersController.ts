import { Request, Response } from 'express';
import User from '../models/User.js';
import Follower from '../models/Follower.js';
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
  const { ensureGroupsForLocation } = await import('./groupController.js');
  await ensureGroupsForLocation(coords, user._id.toString());
} catch (err) {
  console.warn('Group creation failed', err);
}

try {
  const { ioInstance } = await import('../socket/index.js');
  const Group = (await import('../models/Group.js')).default;

  const groups = await Group.find({ members: userId }).lean();

  const haversine = ([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) => {
    const R = 6371e3;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  for (const g of groups) {
    const distance = haversine(coords, g.location.coordinates);
    const allowed = g.distanceRange === '1KM' ? distance <= 1000 : distance <= 2000;

    if (!allowed) {
      await Group.findByIdAndUpdate(g._id, { $pull: { members: user._id } });
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

export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing user id' });

    const user = await User.findById(id).select('_id username name isOnline createdAt').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const followUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing user id' });
    
    const userId = req.user._id.toString();
    const targetUserId = id;
    
    if (userId === targetUserId) return res.status(400).json({ message: 'Cannot follow yourself' });

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);
    
    if (!user || !targetUser) return res.status(404).json({ message: 'User not found' });

    // Check if already following
    const existingFollow = await Follower.findOne({ followerId: userId, followingId: targetUserId });
    if (existingFollow) return res.status(400).json({ message: 'Already following this user' });

    // Create follower relationship
    const followerRecord = new Follower({ followerId: userId, followingId: targetUserId });
    await followerRecord.save();

    res.json({ ok: true, message: 'User followed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const unfollowUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing user id' });
    
    const userId = req.user._id.toString();
    const targetUserId = id;

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);
    
    if (!user || !targetUser) return res.status(404).json({ message: 'User not found' });

    // Delete follower relationship
    await Follower.findOneAndDelete({ followerId: userId, followingId: targetUserId });

    res.json({ ok: true, message: 'User unfollowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getFollowing = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    
    // Get all follower records where this user is the follower
    const followingRecords = await Follower.find({ followerId: userId }).lean();
    
    // Extract the list of user IDs being followed
    const followingIds = followingRecords.map((f: any) => String(f.followingId || f.followingId?._id));

    res.json({ following: followingIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getFollowers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    
    // Get all follower records where this user is being followed
    const followerRecords = await Follower.find({ followingId: userId }).lean();
    
    // Extract the user IDs of followers
    const followerIds = followerRecords.map((f: any) => String(f.followerId || f.followerId?._id));
    
    // Fetch full user details
    const followers = await User.find({ _id: { $in: followerIds } })
      .select('_id username name isOnline')
      .lean();
    
    res.json({ followers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getFollowingList = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    
    // Get all follower records where this user is the follower
    const followingRecords = await Follower.find({ followerId: userId }).lean();
    
    // Extract the user IDs being followed
    const followingIds = followingRecords.map((f: any) => String(f.followingId || f.followingId?._id));
    
    // Fetch full user details
    const following = await User.find({ _id: { $in: followingIds } })
      .select('_id username name isOnline')
      .lean();
    
    res.json({ following });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
