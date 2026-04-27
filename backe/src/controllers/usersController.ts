import { Request, Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import Follower from '../models/Follower.js';
import { AuthRequest } from '../middleware/auth.js';
import { getBlockedUserIdsForViewer, isEitherUserBlocked } from '../utils/blocking.js';
import { createNotification } from './notificationController.js';

export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { location } = req.body;
    if (!location || !Array.isArray(location.coordinates)) return res.status(400).json({ message: 'Invalid location' });

    const coords = location.coordinates as [number, number];
    const userId = req.user._id.toString();
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.location = { type: 'Point', coordinates: coords } as any;
    await user.save();
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
        if (String((g as any).groupType || 'LOCAL') !== 'LOCAL') continue;
        if (!(g as any).location?.coordinates || (g as any).location.coordinates.length !== 2) continue;

        const distance = haversine(coords, (g as any).location.coordinates);
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
      profilePicture: u.profilePicture,
      about: u.about,
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

export const getRandomUsers = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?._id?.toString();
    const excludeId =
      userId && mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : undefined;

    const matchStage: Record<string, any> = { isOnline: true };

    // Exclude:
    // - the viewer themself
    // - anyone the viewer has blocked
    // - anyone who has blocked the viewer
    const excludeIds: mongoose.Types.ObjectId[] = [];
    if (excludeId) excludeIds.push(excludeId);

    if (userId) {
      const blockedIds = await getBlockedUserIdsForViewer(String(userId));
      for (const bid of blockedIds) {
        if (mongoose.isValidObjectId(bid)) {
          excludeIds.push(new mongoose.Types.ObjectId(bid));
        }
      }
    }

    if (excludeIds.length > 0) matchStage._id = { $nin: excludeIds };

    // Get random online users globally
    const results = await User.aggregate([
      {
        $match: {
          ...matchStage,
        }
      },
      {
        $sample: { size: 50 }
      },
      {
        $project: {
          password: 0,
          location: 0,
        },
      },
    ]);

    const users = results.map((u: any) => ({
      id: u._id,
      username: u.username,
      name: u.name,
      profilePicture: u.profilePicture,
      about: u.about,
      isOnline: u.isOnline,
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
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: 'Missing username' });
    const available = await (User as any).isUsernameAvailable(username as string);
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
    const users = await User.find({ _id: { $ne: userId }, username: regex })
      .select('_id username name profilePicture about isOnline')
      .limit(20)
      .lean();

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

    const user = await User.findById(id)
      .select('_id username name profilePicture about professionType professionDetail additionalDetails isOnline createdAt totalEarnings withdrawnTotal')
      .lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (await isEitherUserBlocked(String(req.user._id), String(id))) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get followers/following counts
    const followersCount = await Follower.countDocuments({ followingId: id });
    const followingCount = await Follower.countDocuments({ followerId: id });

    res.json({ user: { ...user, followersCount, followingCount } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const setE2EEPublicKey = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user._id);
    const publicKeyB64 = String(req.body?.publicKey || '').trim();
    if (!publicKeyB64) return res.status(400).json({ message: 'Missing publicKey' });

    let pubBytes: Buffer;
    try {
      pubBytes = Buffer.from(publicKeyB64, 'base64');
    } catch {
      return res.status(400).json({ message: 'Invalid publicKey encoding' });
    }

    // WebCrypto ECDH P-256 raw public key is 65 bytes (0x04 + x(32) + y(32)).
    // Some legacy clients may send raw x coordinate (32 bytes), so accept both.
    if (pubBytes.length !== 32 && pubBytes.length !== 65) {
      return res.status(400).json({ message: 'Invalid publicKey length' });
    }

    const digest = crypto.createHash('sha256').update(pubBytes).digest();
    const keyId = digest.subarray(0, 8).toString('base64url');

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    (user as any).e2eePublicKey = publicKeyB64;
    (user as any).e2eeKeyId = keyId;
    (user as any).e2eeUpdatedAt = new Date();
    await user.save();

    res.json({ ok: true, keyId });
  } catch (err) {
    console.error('setE2EEPublicKey error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getE2EEPublicKey = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing user id' });

    if (await isEitherUserBlocked(String(req.user._id), String(id))) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findById(id).select('_id e2eePublicKey e2eeKeyId e2eeUpdatedAt').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      userId: user._id,
      publicKey: (user as any).e2eePublicKey || null,
      keyId: (user as any).e2eeKeyId || null,
      updatedAt: (user as any).e2eeUpdatedAt || null,
    });
  } catch (err) {
    console.error('getE2EEPublicKey error', err);
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

    if (await isEitherUserBlocked(String(userId), String(targetUserId))) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);
    
    if (!user || !targetUser) return res.status(404).json({ message: 'User not found' });

    // Check if already following
    const existingFollow = await Follower.findOne({ followerId: userId, followingId: targetUserId });
    if (existingFollow) return res.status(400).json({ message: 'Already following this user' });

    // Create follower relationship
    const followerRecord = new Follower({ followerId: userId, followingId: targetUserId });
    await followerRecord.save();

    // Notify target user
    await createNotification(targetUserId, userId, 'follow');

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
      .select('_id username name profilePicture about isOnline')
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
      .select('_id username name profilePicture about isOnline')
      .lean();
    
    res.json({ following });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProfilePicture = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    const { profilePictureUrl } = req.body;

    if (!profilePictureUrl) {
      return res.status(400).json({ message: 'Profile picture URL is required' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { profilePicture: profilePictureUrl },
      { new: true }
    ).select('_id username name email profilePicture isOnline').lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBio = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    const { professionType, professionDetail, additionalDetails } = req.body;

    if (professionType && !['Student', 'Working Professional'].includes(professionType)) {
      return res.status(400).json({ message: 'Invalid profession type' });
    }

    if (professionDetail && typeof professionDetail !== 'string') {
      return res.status(400).json({ message: 'Detail must be a string' });
    }
    
    const detailText = professionDetail ? professionDetail.trim() : '';
    if (detailText.length > 280) {
      return res.status(400).json({ message: 'Detail must be 280 characters or less' });
    }

    const updateData: any = {};
    if (professionType !== undefined) updateData.professionType = professionType;
    if (professionDetail !== undefined) updateData.professionDetail = detailText;
    
    if (additionalDetails !== undefined) {
      if (!Array.isArray(additionalDetails)) {
        return res.status(400).json({ message: 'additionalDetails must be an array' });
      }
      updateData.additionalDetails = additionalDetails
        .map(d => String(d).trim())
        .filter(d => d.length > 0)
        .slice(0, 10);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    )
      .select('_id username name email profilePicture about professionType professionDetail additionalDetails isOnline createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listBlockedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.user._id);
    const me = await User.findById(userId).select('blockedUsers').lean();
    const blockedIds = ((me as any)?.blockedUsers || []).map((id: any) => String(id));
    if (blockedIds.length === 0) return res.json({ blocked: [] });

    const blocked = await User.find({ _id: { $in: blockedIds } })
      .select('_id username name profilePicture about isOnline')
      .lean();

    res.json({ blocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const blockUser = async (req: AuthRequest, res: Response) => {
  try {
    const meId = String(req.user._id);
    const targetId = String(req.params.id || '').trim();
    if (!targetId) return res.status(400).json({ message: 'Missing user id' });
    if (!mongoose.isValidObjectId(targetId)) return res.status(400).json({ message: 'Invalid user id' });
    if (meId === targetId) return res.status(400).json({ message: 'Cannot block yourself' });

    const me = await User.findById(meId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const already = (me as any).blockedUsers?.some((id: any) => String(id) === targetId);
    if (!already) {
      (me as any).blockedUsers = (me as any).blockedUsers || [];
      (me as any).blockedUsers.push(targetId);
      await me.save();
    }

    res.json({ ok: true, blockedUserId: targetId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const unblockUser = async (req: AuthRequest, res: Response) => {
  try {
    const meId = String(req.user._id);
    const targetId = String(req.params.id || '').trim();
    if (!targetId) return res.status(400).json({ message: 'Missing user id' });
    if (!mongoose.isValidObjectId(targetId)) return res.status(400).json({ message: 'Invalid user id' });
    if (meId === targetId) return res.status(400).json({ message: 'Cannot unblock yourself' });

    const me = await User.findById(meId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    (me as any).blockedUsers = ((me as any).blockedUsers || []).filter((id: any) => String(id) !== targetId);
    await me.save();

    res.json({ ok: true, unblockedUserId: targetId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
