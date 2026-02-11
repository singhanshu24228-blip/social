import { Request, Response } from 'express';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Room from '../models/Room.js';
import RoomComment from '../models/RoomComment.js';
import fs from 'fs';
import path from 'path';
import { uploadsDir, legacyUploadsDir } from '../utils/paths.js';
import {
  canUserEnterNightMode,
  getNightModeTimeInfo,
  shouldUserBeInNightMode,
  isCurrentlyInNightMode,
  formatTimeRemaining,
} from '../utils/nightMode.js';

/**
 * Enter night mode - only allowed during entry window (10 PM - 3:30 AM)
 * All validation is server-side to prevent client-side manipulation
 */
export const enterNightMode = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Server-side validation: Check if user can enter night mode NOW
    if (!canUserEnterNightMode()) {
      const timeInfo = getNightModeTimeInfo();
      return res.status(403).json({
        success: false,
        message: timeInfo.message,
        timeUntilNightMode: timeInfo.timeUntilNightMode,
      });
    }

    // Update user's night mode status
    const user = await User.findByIdAndUpdate(
      userId,
      {
        isInNightMode: true,
        nightModeEnteredAt: new Date(),
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Welcome to Night Mode 🌙',
      user: {
        _id: user?._id,
        username: user?.username,
        isInNightMode: user?.isInNightMode,
      },
    });
  } catch (error) {
    console.error('Error entering night mode:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Exit night mode - can be done anytime
 */
export const exitNightMode = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isInNightMode: false,
        lastNightModeExit: new Date(),
      },
      { new: true }
    );

    // Trigger cleanup of expired rooms
    cleanupExpiredNightRooms().catch(console.error);

    res.json({
      success: true,
      message: 'Exited Night Mode',
      user: {
        _id: user?._id,
        username: user?.username,
        isInNightMode: user?.isInNightMode,
      },
    });
  } catch (error) {
    console.error('Error exiting night mode:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get current night mode status for authenticated user
 */
export const getNightModeStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate if user should still be in night mode
    const shouldBeInNight = shouldUserBeInNightMode(user.nightModeEnteredAt);
    const timeInfo = getNightModeTimeInfo();

    // If user is marked as in night mode but shouldn't be, update them
    if (user.isInNightMode && !shouldBeInNight) {
      user.isInNightMode = false;
      user.lastNightModeExit = new Date();
      await user.save();
    }

    res.json({
      success: true,
      isInNightMode: user.isInNightMode && shouldBeInNight,
      canEnterNightMode: canUserEnterNightMode(),
      timeInfo,
      user: {
        _id: user._id,
        username: user.username,
        isInNightMode: user.isInNightMode && shouldBeInNight,
      },
    });
  } catch (error) {
    console.error('Error getting night mode status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get night posts (only accessible in night mode)
 * Server-side validation prevents access outside of night mode
 */
export const getNightPosts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Strict server-side check: User must be in night mode AND it must be nighttime
    const isInValidNightMode =
      user.isInNightMode && shouldUserBeInNightMode(user.nightModeEnteredAt);
    const isNightTime = isCurrentlyInNightMode();

    if (!isInValidNightMode || !isNightTime) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not in valid night mode.',
      });
    }

    // Only return night posts, sorted by recent first
    const nightPosts = await Post.find({ isNightPost: true })
      .populate('user', 'username name')
      .populate('comments.user', 'username name')
      .sort({ createdAt: -1 })
      .allowDiskUse(true);

    // Convert Maps to objects for JSON serialization
    const nightPostsWithReactions = nightPosts.map((post) => {
      const postObj = post.toObject();
      if (post.reactions) {
        (postObj as any).reactions = Object.fromEntries(
          post.reactions.entries()
        );
      }
      if (post.userReactions) {
        (postObj as any).userReactions = Object.fromEntries(
          post.userReactions.entries()
        );
      }
      return postObj;
    });

    res.json({
      success: true,
      posts: nightPostsWithReactions,
      totalCount: nightPostsWithReactions.length,
    });
  } catch (error) {
    console.error('Error getting night posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Create a night post (only during night mode)
 * Server-side validation ensures posts can only be created during valid night mode
 */
export const createNightPost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Strict validation: Can only create during night mode when it's nighttime
    const isInValidNightMode =
      user.isInNightMode && shouldUserBeInNightMode(user.nightModeEnteredAt);
    const isNightTime = isCurrentlyInNightMode();

    if (!isInValidNightMode || !isNightTime) {
      return res.status(403).json({
        success: false,
        message: 'Night posts can only be created during Night Mode.',
      });
    }

    const { content, imageUrl, songUrl, anonymous } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const post = new Post({
      user: userId,
      content,
      imageUrl,
      songUrl,
      anonymous: anonymous === 'true' || anonymous === true,
      isNightPost: true,
    });

    await post.save();
    await post.populate('user', 'username name');

    const postObj: any = post.toObject();
    if (post.reactions) {
      postObj.reactions = Object.fromEntries(post.reactions.entries());
    }
    if (post.userReactions) {
      postObj.userReactions = Object.fromEntries(post.userReactions.entries());
    }

    res.status(201).json({
      success: true,
      post: postObj,
      message: 'Night post created successfully',
    });
  } catch (error) {
    console.error('Error creating night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Create a night room
 */
export const createNightRoom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only allow creation while in valid night mode
    const isInValidNightMode = user.isInNightMode && shouldUserBeInNightMode(user.nightModeEnteredAt);
    const isNightTime = isCurrentlyInNightMode();

    if (!isInValidNightMode || !isNightTime) {
      return res.status(403).json({ success: false, message: 'Rooms can only be created during Night Mode.' });
    }

    const { name } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    const room = new Room({ name: name.trim(), creator: userId, participants: [userId], isNightRoom: true });
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
    const rooms = await Room.find({ isNightRoom: true }).populate('creator', 'username name').sort({ createdAt: -1 }).lean();
    res.json({ success: true, rooms });
  } catch (error) {
    console.error('Error fetching night rooms:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Request to join a room (adds user to pendingRequests)
 */
export const requestJoinRoom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const roomId = req.params.id;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    // If already participant
    if (room.participants.map(String).includes(String(userId))) {
      return res.json({ success: true, message: 'Already joined' });
    }

    // If already requested
    if (room.pendingRequests.map(String).includes(String(userId))) {
      return res.json({ success: true, message: 'Request pending' });
    }

    room.pendingRequests.push(userId);
    await room.save();
    res.json({ success: true, message: 'Join request submitted' });
  } catch (error) {
    console.error('Error requesting join room:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Approve a pending join request (only creator)
 */
export const approveJoinRoom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // approver
    const roomId = req.params.id;
    const approveUserId = req.body.userId;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    if (String(room.creator) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Only room creator can approve requests' });
    }

    // Remove from pending and add to participants
    room.pendingRequests = room.pendingRequests.filter((p: any) => String(p) !== String(approveUserId));
    if (!room.participants.map(String).includes(String(approveUserId))) {
      room.participants.push(approveUserId);
    }
    await room.save();
    res.json({ success: true, message: 'User approved', room });
  } catch (error) {
    console.error('Error approving join room:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get room details
 */
export const getRoomDetails = async (req: Request, res: Response) => {
  try {
    const roomId = req.params.id;
    const room = await Room.findById(roomId).populate('creator', 'username name').populate('participants', 'username name').populate('pendingRequests', 'username name').lean();
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

    // Only participants can comment
    if (!room.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ success: false, message: 'Only room participants can comment' });
    }

    const commentData: any = {
      room: roomId,
      author: userId,
    };
    if (content) commentData.content = content.trim();
    if (mediaUrl) commentData.mediaUrl = mediaUrl;
    if (mediaType) commentData.mediaType = mediaType;

    // If this comment has no media it should be ephemeral (floating) and expire in ~10 seconds.
    // If it contains media (image/video), do NOT set expiresAt so it persists until rooms are cleaned up.
    if (!mediaUrl) {
      commentData.expiresAt = new Date(Date.now() + 10000); // 10 seconds from now
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
    const comments = await RoomComment.find({ room: roomId }).populate('author', 'username name').sort({ createdAt: 1 }).lean();
    res.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching room comments:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Check if user can send photo/stream in room (creator only)
 */
export const canSendMediaInRoom = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const roomId = req.params.id;

    const room = await Room.findById(roomId).lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const isCreator = String(room.creator) === String(userId);
    res.json({ success: true, canSend: isCreator });
  } catch (error) {
    console.error('Error checking media permission:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Clean up rooms after night mode ends (called from exitNightMode or scheduled)
 */
export const cleanupExpiredNightRooms = async () => {
  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 12); // Delete rooms older than 12 hours

    // Find rooms to remove so we can delete associated comments and media files
    const roomsToDelete = await Room.find({ isNightRoom: true, createdAt: { $lt: cutoff } }).lean();
    let totalRooms = 0;
    for (const room of roomsToDelete) {
      totalRooms += 1;
      try {
        // Find comments for this room that contain media
        const mediaComments = await RoomComment.find({ room: room._id, mediaUrl: { $exists: true, $ne: null } }).lean();
        for (const mc of mediaComments) {
          try {
            if (mc.mediaUrl) {
              const tryUnlink = async (base: string, filename: string) => {
                const filePath = path.join(base, filename);
                await fs.promises.unlink(filePath).catch(() => {});
              };

              // Parse filename from mediaUrl (expected to be /uploads/<filename>)
              try {
                const parsed = new URL(mc.mediaUrl);
                const filename = path.basename(parsed.pathname);
                await tryUnlink(uploadsDir, filename);
                await tryUnlink(legacyUploadsDir, filename);
              } catch (e) {
                // If URL parsing fails, attempt a fallback by extracting after /uploads/
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

        // Delete all comments for the room (including media-less ones)
        await RoomComment.deleteMany({ room: room._id });

        // Finally delete the room itself
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

    const post = await Post.findOneAndDelete({
      _id: postId,
      user: userId,
      isNightPost: true
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Night post not found or not authorized'
      });
    }

    res.json({
      success: true,
      message: 'Night post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get time until night mode (for daytime UI)
 */
export const getTimeUntilNightMode = async (
  req: Request,
  res: Response
) => {
  try {
    const timeInfo = getNightModeTimeInfo();

    res.json({
      success: true,
      isCurrentlyInNightMode: timeInfo.isCurrentlyInNightMode,
      isInEntryWindow: timeInfo.isInEntryWindow,
      timeUntilNightMode: timeInfo.timeUntilNightMode,
      timeUntilDayMode: timeInfo.timeUntilDayMode,
      formattedTimeUntilNightMode: timeInfo.timeUntilNightMode
        ? formatTimeRemaining(timeInfo.timeUntilNightMode)
        : null,
      message: timeInfo.message,
    });
  } catch (error) {
    console.error('Error getting time until night mode:', error);
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

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const post = (await Post.findById(postId)) as any;

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (!post.reactions) {
      post.reactions = new Map();
    }

    if (!post.userReactions) {
      post.userReactions = new Map();
    }

    const userCurrentEmoji = post.userReactions.get(userId);

    // If clicking the same emoji, remove the reaction (toggle off)
    if (userCurrentEmoji === emoji) {
      // Decrease reaction count
      const currentCount = ((post.reactions.get(emoji) as number) || 0);
      if (currentCount > 1) {
        post.reactions.set(emoji, currentCount - 1);
      } else {
        post.reactions.delete(emoji);
      }
      // Remove user's reaction
      post.userReactions.delete(userId);
    } else if (userCurrentEmoji) {
      // If clicking a different emoji, prevent it
      return res.status(400).json({ message: 'You have already reacted to this post' });
    } else {
      // First reaction - add it
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
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    post.comments.push({
      user: userId,
      content: content.trim(),
      createdAt: new Date(),
    });

    await post.save();
    await post.populate('user', 'username name');
    await post.populate('comments.user', 'username name');

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error adding comment to night post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
