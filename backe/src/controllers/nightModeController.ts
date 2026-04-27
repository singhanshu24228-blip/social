import { Request, Response } from 'express';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Room from '../models/Room.js';
import RoomComment from '../models/RoomComment.js';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { uploadsDir, legacyUploadsDir } from '../utils/paths.js';
// Study Mode is always accessible — entry is admin-approved (isInNightMode flag)
// No longer time-restricted to 10 PM–5 AM

/**
 * Enter Study Mode — always allowed; marks the user as active in Study Mode.
 */
export const enterNightMode = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { isInNightMode: true, nightModeEnteredAt: new Date() },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Welcome to Study Mode 📚',
      user: { _id: user?._id, username: user?.username, isInNightMode: user?.isInNightMode },
    });
  } catch (error) {
    console.error('Error entering study mode:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Exit Study Mode — can be done anytime
 */
export const exitNightMode = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      { isInNightMode: false, lastNightModeExit: new Date() },
      { new: true }
    );

    // Trigger cleanup of expired rooms
    cleanupExpiredNightRooms().catch(console.error);

    res.json({
      success: true,
      message: 'Exited Study Mode',
      user: { _id: user?._id, username: user?.username, isInNightMode: user?.isInNightMode },
    });
  } catch (error) {
    console.error('Error exiting study mode:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get current Study Mode status for authenticated user
 */
export const getNightModeStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      success: true,
      isInNightMode: user.isInNightMode || false,
      canEnterNightMode: true, // Always allowed
      timeInfo: { isCurrentlyInNightMode: true, isInEntryWindow: true, message: 'Study Mode is always available 📚' },
      user: {
        _id: user._id,
        username: user.username,
        isInNightMode: user.isInNightMode || false,
      },
    });
  } catch (error) {
    console.error('Error getting study mode status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Study Mode posts
 */
export const getNightPosts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.isInNightMode) {
      return res.status(403).json({ success: false, message: 'Access denied. You are not in Study Mode. Please enter Study Mode first.' });
    }

    const nightPosts = await Post.find({ isNightPost: true })
      .populate('user', 'username name')
      .populate('comments.user', 'username name')
      .sort({ createdAt: -1 })
      .allowDiskUse(true);

    const nightPostsWithReactions = nightPosts.map((post) => {
      const postObj = post.toObject();
      if (post.reactions) (postObj as any).reactions = Object.fromEntries(post.reactions.entries());
      if (post.userReactions) (postObj as any).userReactions = Object.fromEntries(post.userReactions.entries());
      return postObj;
    });

    res.json({ success: true, posts: nightPostsWithReactions, totalCount: nightPostsWithReactions.length });
  } catch (error) {
    console.error('Error getting night posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Create a Study Mode post
 */
export const createNightPost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.isInNightMode) {
      return res.status(403).json({ success: false, message: 'Study posts can only be created while in Study Mode.' });
    }

    const { content, imageUrl, songUrl, anonymous } = req.body;
    const safeContent = content == null ? '' : String(content);
    const hasAny = Boolean(String(safeContent).trim() || String(imageUrl || '').trim() || String(songUrl || '').trim());

    if (!hasAny) return res.status(400).json({ message: 'Nothing to post' });

    const post = new Post({
      user: userId,
      content: safeContent,
      imageUrl,
      songUrl,
      anonymous: anonymous === 'true' || anonymous === true,
      isNightPost: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await post.save();
    await post.populate('user', 'username name');

    const postObj: any = post.toObject();
    if (post.reactions) postObj.reactions = Object.fromEntries(post.reactions.entries());
    if (post.userReactions) postObj.userReactions = Object.fromEntries(post.userReactions.entries());

    res.status(201).json({ success: true, post: postObj, message: 'Night post created successfully' });
  } catch (error) {
    console.error('Error creating night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Create a Study Room
 */
export const createNightRoom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.isInNightMode) {
      return res.status(403).json({ success: false, message: 'You must be in Study Mode to create a Study Room.' });
    }

    const { name, entryFee: entryFeeRaw } = req.body as any;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: 'Room name is required' });

    const entryFeeNum = Number(entryFeeRaw || 0);
    const entryFee = Number.isFinite(entryFeeNum) && entryFeeNum > 0 ? Math.floor(entryFeeNum) : 0;
    if (entryFee < 0) return res.status(400).json({ message: 'Invalid entry fee' });
    if (entryFee > 100000) return res.status(400).json({ message: 'Entry fee too high' });

    const room = new Room({
      name: name.trim(),
      creator: userId,
      participants: [userId],
      isNightRoom: true,
      entryFee,
    });
    await room.save();
    await room.populate('creator', 'username name');

    res.json({ success: true, room });
  } catch (error) {
    console.error('Error creating night room:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * List night rooms
 */
export const getNightRooms = async (req: Request, res: Response) => {
  try {
    const rooms = await Room.find({ isNightRoom: true })
      .populate('creator', 'username name')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, rooms });
  } catch (error) {
    console.error('Error fetching night rooms:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Join a room directly.
 */
export const joinNightRoom = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.id);
    const roomId = String(req.params.id || '').trim();

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    if (room.participants.map(String).includes(String(userId))) {
      return res.json({ success: true, joined: true, roomId });
    }

    room.participants.push(userId as any);
    await room.save();
    return res.json({ success: true, joined: true, roomId });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


/**
 * Get room details
 */
export const getRoomDetails = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;
    const room = await Room.findById(roomId)
      .populate('creator', 'username name')
      .populate('participants', 'username name')
      .lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.json({ success: true, room });
  } catch (error) {
    console.error('Error fetching room details:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Post a comment in a room
 */
export const postRoomComment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const roomId = req.params.id;
    const { content, mediaUrl, mediaType } = req.body;

    if ((!content || content.trim().length === 0) && !mediaUrl) {
      return res.status(400).json({ message: 'Comment content or media is required' });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    if (!room.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ success: false, message: 'Only room participants can comment' });
    }

    const commentData: any = { room: roomId, author: userId };
    if (content) commentData.content = content.trim();
    if (mediaUrl) commentData.mediaUrl = mediaUrl;
    if (mediaType) commentData.mediaType = mediaType;

    if (!mediaUrl) {
      commentData.expiresAt = new Date(Date.now() + 10000);
    }

    const comment = new RoomComment(commentData);
    await comment.save();
    await comment.populate('author', 'username name');

    res.json({ success: true, comment });
  } catch (error) {
    console.error('Error posting room comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get room comments
 */
export const getRoomComments = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;
    const comments = await RoomComment.find({ room: roomId })
      .populate('author', 'username name')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching room comments:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Check if user can send photo/stream in room.
 * In Study Mode, ALL participants can open their camera.
 */
export const canSendMediaInRoom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const roomId = req.params.id;

    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    // All participants can stream in Study Mode (like Zoom)
    const isParticipant = room.participants.map(String).includes(String(userId));
    res.json({ success: true, canSend: isParticipant, isCreator: String(room.creator) === String(userId) });
  } catch (error) {
    console.error('Error checking media permission:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Clean up rooms after night mode ends (called from exitNightMode or scheduled)
 * Rooms also auto-expire via MongoDB TTL index after 24 hours.
 */
export const cleanupExpiredNightRooms = async () => {
  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24); // Delete rooms older than 24 hours (one night)

    const roomsToDelete = await Room.find({ isNightRoom: true, createdAt: { $lt: cutoff } }).lean();
    let totalRooms = 0;
    for (const room of roomsToDelete) {
      totalRooms += 1;
      try {
        const mediaComments = await RoomComment.find({ room: room._id, mediaUrl: { $exists: true, $ne: null } }).lean();
        for (const mc of mediaComments) {
          try {
            if (mc.mediaUrl) {
              const tryUnlink = async (base: string, filename: string) => {
                const filePath = path.join(base, filename);
                await fs.promises.unlink(filePath).catch(() => {});
              };
              try {
                const parsed = new URL(mc.mediaUrl);
                const filename = path.basename(parsed.pathname);
                await tryUnlink(uploadsDir, filename);
                await tryUnlink(legacyUploadsDir, filename);
              } catch (e) {
                const idx = mc.mediaUrl.indexOf('/uploads/');
                if (idx !== -1) {
                  const filename = mc.mediaUrl.substring(idx + '/uploads/'.length);
                  await tryUnlink(uploadsDir, filename);
                  await tryUnlink(legacyUploadsDir, filename);
                }
              }
            }
          } catch (e) {
            console.warn('Failed to remove media file for comment', mc._id, e);
          }
        }
        await RoomComment.deleteMany({ room: room._id });
        await Room.deleteOne({ _id: room._id });
      } catch (e) {
        console.error('Error deleting room and associated data for room', room._id, e);
      }
    }
    console.log(`Cleaned up ${totalRooms} expired night rooms`);
  } catch (error) {
    console.error('Error cleaning up night rooms:', error);
  }
};

/**
 * Delete a night post
 */
export const deleteNightPost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.id;

    const post = await Post.findOneAndDelete({ _id: postId, user: userId, isNightPost: true });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Night post not found or not authorized' });
    }

    res.json({ success: true, message: 'Night post deleted successfully' });
  } catch (error) {
    console.error('Error deleting night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get Study Mode availability info — always available
 */
export const getTimeUntilNightMode = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      isCurrentlyInNightMode: true,
      isInEntryWindow: true,
      timeUntilNightMode: 0,
      timeUntilDayMode: null,
      formattedTimeUntilNightMode: null,
      message: 'Study Mode is always available 📚',
    });
  } catch (error) {
    console.error('Error getting study mode status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add a reaction/emoji to a night post
 */
export const addNightPostReaction = async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body;
    const postId = req.params.id;
    const userId = String((req as any).user.id);

    if (!emoji) return res.status(400).json({ message: 'Emoji is required' });

    const post = (await Post.findById(postId)) as any;
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    if (!post.reactions) post.reactions = new Map();
    if (!post.userReactions) post.userReactions = new Map();

    const userCurrentEmoji = post.userReactions.get(userId);

    if (userCurrentEmoji === emoji) {
      const currentCount = ((post.reactions.get(emoji) as number) || 0);
      if (currentCount > 1) {
        post.reactions.set(emoji, currentCount - 1);
      } else {
        post.reactions.delete(emoji);
      }
      post.userReactions.delete(userId);
    } else if (userCurrentEmoji) {
      return res.status(400).json({ message: 'You have already reacted to this post' });
    } else {
      const currentCount = ((post.reactions.get(emoji) as number) || 0);
      post.reactions.set(emoji, currentCount + 1);
      post.userReactions.set(userId, emoji);
    }

    await post.save();
    await post.populate('user', 'username name');
    await post.populate('comments.user', 'username name');

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error adding reaction to night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add a comment to a night post
 */
export const addNightPostComment = async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const userId = (req as any).user.id;
    const postId = req.params.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.comments.push({ user: userId, content: content.trim(), createdAt: new Date() });

    await post.save();
    await post.populate('user', 'username name');
    await post.populate('comments.user', 'username name');

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error adding comment to night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
