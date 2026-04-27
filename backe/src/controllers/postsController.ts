import { Request, Response } from 'express';
import path from 'path';
import Post, { IPost } from '../models/Post.js';
import Community from '../models/Community.js';
import User from '../models/User.js';
import Follower from '../models/Follower.js';
import { createNotification } from './notificationController.js';
import { calculateScore } from '../utils/yourVoiceAI.js';
import fs from 'fs';
import { uploadsDir, frontendPublicDir } from '../utils/paths.js';
import { isCloudinaryConfigured, uploadFileToCloudinary } from '../utils/cloudinary.js';

import { getBlockedUserIdsForViewer, isEitherUserBlocked } from '../utils/blocking.js';

const isProd = process.env.NODE_ENV === 'production';
const debugPosts = !isProd && process.env.DEBUG_POSTS?.trim() === 'true';

const toAbsoluteAssetUrl = (baseUrl: string, url?: string) => {
  if (!url) return url;
  const s = String(url);
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) {
    return s;
  }

  // Only absolute-ify assets that are actually served by this backend.
  // In dev, the frontend runs on a different origin (e.g. Vite) and ships "public" songs
  // like `/Aakh%20talabani.m4a`. Prefixing those with the API baseUrl breaks playback.
  if (s.startsWith('/uploads/')) return `${baseUrl}${s}`;
  if (s.startsWith('uploads/')) return `${baseUrl}/${s}`;

  // Some older records may store just the filename; treat those as uploads.
  if (!s.includes('/') && /\.(png|jpe?g|gif|webp|mp4|webm|ogg|mov|m4v|mp3|m4a|wav|aac|flac)$/i.test(s)) {
    return `${baseUrl}/uploads/${s}`;
  }

  // For any other leading-slash paths (e.g. frontend public assets), keep as-is so the
  // browser loads from the current origin.
  return s;
};

export const createPost = async (req: Request, res: Response) => {
  try {
    const { content, anonymous, isPrivate, isLocked, lockedPrice, communityId } = req.body;
    const userId = (req as any).user._id;
    if (debugPosts) {
      console.log('Backend createPost - req.body:', req.body);
      console.log('Backend createPost - req.files:', (req as any).files);
    }

    // Build absolute base URL from request so frontend receives fully-qualified secure URLs
    // Use X-Forwarded-Proto for proxy scenarios (Render, Docker, nginx, etc.)
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    if (debugPosts) console.log('Backend createPost - computed baseUrl:', baseUrl);

    // compute image URL; handle both upload and provided URL
    let imageUrl: string | undefined;
    if ((req as any).files?.image) {
      const file = (req as any).files.image[0];
      if (debugPosts) {
        console.log(`File uploaded with name: ${file.filename}, size: ${file.size}`);
      }
      const filePath = path.join(uploadsDir, file.filename);
      // verify file on disk
      if (fs.existsSync(filePath)) {
        const fileSize = fs.statSync(filePath).size;
        if (debugPosts) console.log(`File verified on disk: ${filePath}, actual size: ${fileSize}`);
      } else {
        console.error(`File NOT found on disk after upload: ${filePath}`);
      }

      if (isCloudinaryConfigured) {
        try {
          const result: any = await uploadFileToCloudinary(filePath, { publicId: file.filename });
          if (result.secure_url) {
            imageUrl = result.secure_url;
            if (debugPosts) console.log('Cloudinary image uploaded:', { originalFile: file.filename, cloudinaryUrl: imageUrl });
          }
          // cleanup disk copy
          try { fs.unlinkSync(filePath); } catch (e) { console.warn('cloud cleanup failed', e); }
          } catch (e) {
            console.error('cloudinary image upload failed', e);
            imageUrl = `${baseUrl}/uploads/${file.filename}`;
          }
        } else {
          imageUrl = `${baseUrl}/uploads/${file.filename}`;
        }
      } else if (req.body?.imageUrl) {
        imageUrl = (() => {
          let s = req.body.imageUrl as string;
        if (!s.startsWith('http')) {
          if (!s.startsWith('/')) {
            s = '/' + s;
          }
          return s;
        }
        return s;
      })();
    }

    // allow using an uploaded file or an existing song URL passed in the body
    let songUrl: string | undefined;
    if ((req as any).files?.song) {
      const sfile = (req as any).files.song[0];
      if (isCloudinaryConfigured) {
        const filePath = path.join(uploadsDir, sfile.filename);
        try {
          const result: any = await uploadFileToCloudinary(filePath, { publicId: sfile.filename });
          if (result.secure_url) {
            songUrl = result.secure_url;
          }
          try { fs.unlinkSync(filePath); } catch (e) { console.warn('cloud cleanup failed', e); }
        } catch (e) {
          console.error('cloudinary song upload failed', e);
          songUrl = `${baseUrl}/uploads/${sfile.filename}`;
        }
      } else {
        songUrl = `${baseUrl}/uploads/${sfile.filename}`;
      }
    } else if (req.body?.songUrl) {
      let s = req.body.songUrl as string;
      // If passed a relative or incomplete path, keep as relative
      if (!s.startsWith('http')) {
        if (!s.startsWith('/')) {
          s = '/' + s;
        }
        songUrl = s;
      } else {
        // Already a full HTTP(S) URL
        songUrl = s;
      }
    } else {
      songUrl = undefined;
    }

    if (debugPosts) console.log('Backend createPost - computed URLs:', { baseUrl, imageUrl, songUrl });

    const anonFlag = (anonymous === 'true' || anonymous === true);
    const isPrivateFlag = (isPrivate === 'true' || isPrivate === true);
    if (debugPosts) {
      console.log('Backend createPost - saving with:', { content, imageUrl, songUrl, userId, anonymous: anonFlag, isPrivate: isPrivateFlag });
    }

    // Fetch user to get username
    const user = await User.findById(userId);
    const username = user?.username || '';

    const isLockedFlag = (isLocked === 'true' || isLocked === true);
    const lockedPriceNum = isLockedFlag && lockedPrice ? Number(lockedPrice) : 0;
    const safeContent = content == null ? '' : String(content);
    const normalizedCommunityId = String(communityId || '').trim();

    let community: any = null;
    if (normalizedCommunityId) {
      community = await Community.findById(normalizedCommunityId).select('_id members name');
      if (!community) {
        return res.status(404).json({ message: 'Community not found' });
      }
      const isMember = ((community as any).members || []).some((member: any) => String(member) === String(userId));
      if (!isMember) {
        return res.status(403).json({ message: 'Join the community before posting' });
      }
    }

    const post = new Post({
      user: userId,
      community: community ? community._id : undefined,
      username,
      content: safeContent,
      imageUrl,
      songUrl,
      anonymous: anonFlag,
      isPrivate: isPrivateFlag,
      isLocked: isLockedFlag,
      lockedPrice: lockedPriceNum,
      unlockedBy: [],
    });

    await post.save();
    await post.populate('user', 'username name profilePicture');

    const postObj: any = post.toObject();
    if (post.reactions) {
      postObj.reactions = Object.fromEntries(post.reactions.entries());
    }
    if (post.userReactions) {
      postObj.userReactions = Object.fromEntries(post.userReactions.entries());
    }
    // Add score to the response
    postObj.score = calculateScore(postObj);

    if (debugPosts) console.log('Backend createPost - saved post object:', postObj);

    res.status(201).json(postObj);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPosts = async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user?._id;
    const communityId = String(req.query?.communityId || '').trim();
    let currentUserFollowing: string[] = [];
    let blockedUserIds: string[] = [];
    
    // If user is authenticated, fetch their following list
    if (currentUserId) {
      const followingRecords = await Follower.find({ followerId: currentUserId })
        .select('followingId')
        .lean();
      currentUserFollowing = followingRecords.map((f: any) => String(f.followingId || f.followingId?._id));
      blockedUserIds = await getBlockedUserIdsForViewer(String(currentUserId));
    }
    
    const filter: any = { isNightPost: { $ne: true } };
    if (communityId) filter.community = communityId;
    else filter.community = { $exists: false };

    const posts = await Post.find(filter)
      .populate('user', 'username name _id profilePicture')
      .populate('community', '_id name profilePicture purpose')
      .populate('comments.user', 'username name profilePicture')
      .sort({ createdAt: -1 })
      .allowDiskUse(true);

    // Calculate scores and sort by score (highest first)
    // Build absolute base URL so clients on a different origin can still render stored relative asset paths.
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const postsWithScores = posts
      .filter(post => {
        const postCreatorId = post.user?._id ? post.user._id.toString() : String(post.user || '');
        if (postCreatorId && blockedUserIds.includes(postCreatorId)) {
          return false;
        }

        // Public posts are always visible
        if (!post.isPrivate) {
          return true;
        }
        
        // Private posts: only visible to creator and their followers
        // postCreatorId already computed above
        
        // Current user is the creator
        if (currentUserId && currentUserId.toString() === postCreatorId) {
          return true;
        }
        
        // Current user is following the post creator
        if (currentUserFollowing.includes(postCreatorId)) {
          return true;
        }
        
        // Don't show private posts to non-followers and non-creators
        return false;
      })
      .map(post => {
        const postObj = post.toObject() as IPost;
        const postCreatorId = post.user._id.toString();
        const isPostOwner = currentUserId && currentUserId.toString() === postCreatorId;
        const hasUnlocked = currentUserId && post.unlockedBy?.some(id => id.toString() === currentUserId.toString());
        
        // Mark locked posts that user hasn't unlocked
        if (post.isLocked && !isPostOwner && !hasUnlocked) {
          (postObj as any).isContentLocked = true;
        }
        
        (postObj as any).imageUrl = toAbsoluteAssetUrl(baseUrl, (postObj as any).imageUrl);
        (postObj as any).songUrl = toAbsoluteAssetUrl(baseUrl, (postObj as any).songUrl);
        // Convert Maps to plain objects for JSON response
        if (post.reactions) {
          (postObj as any).reactions = Object.fromEntries(post.reactions.entries());
        }
        if (post.userReactions) {
          (postObj as any).userReactions = Object.fromEntries(post.userReactions.entries());
        }
        // Calculate score from the normalized plain object so reaction shape is consistent
        return {
          ...postObj,
          score: calculateScore(postObj as any)
        };
      });
    
    postsWithScores.sort((a, b) => {
      const scoreA = (b.score || 0) - (a.score || 0);
      if (Math.abs(scoreA) > 0.1) {
        return scoreA;
      }
      
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    res.json(postsWithScores);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPostById = async (req: Request, res: Response) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'username name profilePicture')
      .populate('community', '_id name profilePicture purpose')
      .populate('comments.user', 'username name profilePicture');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const viewerId = String((req as any).user?._id || '');
    const postOwnerId = String((post as any).user?._id || post.user || '');
    if (viewerId && postOwnerId && await isEitherUserBlocked(viewerId, postOwnerId)) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const postObj: any = post.toObject();
    postObj.imageUrl = toAbsoluteAssetUrl(baseUrl, postObj.imageUrl);
    postObj.songUrl = toAbsoluteAssetUrl(baseUrl, postObj.songUrl);
    res.json(postObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePost = async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const userId = (req as any).user.id;

    const post = await Post.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { content },
      { new: true }
    ).populate('user', 'username name profilePicture');

    if (!post) {
      return res.status(404).json({ message: 'Post not found or not authorized' });
    }

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deletePost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const post = await Post.findOneAndDelete({ _id: req.params.id, user: userId });

    if (!post) {
      return res.status(404).json({ message: 'Post not found or not authorized' });
    }

    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const likePost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const isLiked = post.likes.includes(userId);

    if (isLiked) {
      post.likes = post.likes.filter(id => id.toString() !== userId.toString());
    } else {
      post.likes.push(userId);
      // Notify post owner when someone likes their post
      if (post.user.toString() !== userId.toString()) {
        await createNotification(
          String(post.user),
          String(userId),
          'like',
          undefined,
          String(post._id)
        );
      }
    }

    await post.save();
    await post.populate('user', 'username name profilePicture');
    await post.populate('comments.user', 'username name profilePicture');

    // Convert Maps to plain objects for JSON response
    const postObj = post.toObject();
    if (post.reactions) {
      (postObj as any).reactions = Object.fromEntries(post.reactions.entries());
    }
    if (post.userReactions) {
      (postObj as any).userReactions = Object.fromEntries(post.userReactions.entries());
    }

    res.json(postObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const addComment = async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const userId = (req as any).user.id;

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.comments.push({
      user: userId,
      content,
      createdAt: new Date(),
    });

    await post.save();
    
    // Notify post owner when someone comments on their post
    if (post.user.toString() !== userId.toString()) {
      await createNotification(
        String(post.user),
        String(userId),
        'comment',
        content,
        String(post._id)
      );
    }

    await post.populate('user', 'username name profilePicture');
    await post.populate('comments.user', 'username name profilePicture');

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPostsByUsername = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const currentUserId = (req as any).user?._id;
    let currentUserFollowing: string[] = [];
    
    // If user is authenticated, fetch their following list
    if (currentUserId) {
      const followingRecords = await Follower.find({ followerId: currentUserId })
        .select('followingId')
        .lean();
      currentUserFollowing = followingRecords.map((f: any) => String(f.followingId || f.followingId?._id));
    }

    const user = await import('../models/User.js').then(m => m.default.findOne({ username }));

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (currentUserId && await isEitherUserBlocked(String(currentUserId), String(user._id))) {
      return res.status(404).json({ message: 'User not found' });
    }

    const posts = await Post.find({ user: user._id })
      .populate('user', 'username name _id profilePicture')
      .populate('community', '_id name profilePicture purpose')
      .populate('comments.user', 'username name profilePicture')
      .sort({ createdAt: -1 })
      .allowDiskUse(true);

    // Calculate scores and sort by score (highest first)
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const postsWithScores = posts
      .filter(post => {
        // Public posts are always visible
        if (!post.isPrivate) {
          return true;
        }
        
        // Private posts: only visible to creator and their followers
        const postCreatorId = post.user._id.toString();
        
        // Current user is the creator
        if (currentUserId && currentUserId.toString() === postCreatorId) {
          return true;
        }
        
        // Current user is following the post creator
        if (currentUserFollowing.includes(postCreatorId)) {
          return true;
        }
        
        // Don't show private posts to non-followers and non-creators
        return false;
      })
      .map(post => {
        const postObj = post.toObject();
        (postObj as any).imageUrl = toAbsoluteAssetUrl(baseUrl, (postObj as any).imageUrl);
        (postObj as any).songUrl = toAbsoluteAssetUrl(baseUrl, (postObj as any).songUrl);
        // Convert Maps to plain objects for JSON response
        if (post.reactions) {
          (postObj as any).reactions = Object.fromEntries(post.reactions.entries());
        }
        if (post.userReactions) {
          (postObj as any).userReactions = Object.fromEntries(post.userReactions.entries());
        }
        return {
          ...postObj,
          score: calculateScore(postObj as any)
        };
      });

    postsWithScores.sort((a, b) => (b.score || 0) - (a.score || 0));

    res.json(postsWithScores);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const addReaction = async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body;
    const postId = req.params.id;
    const userId = String((req as any).user.id);

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const post = await Post.findById(postId) as any;

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
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
      const currentCount = (post.reactions.get(emoji) as number) || 0;
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
      // Increment reaction count for the emoji
      const currentCount = (post.reactions.get(emoji) as number) || 0;
      post.reactions.set(emoji, currentCount + 1);

      // Record this user's reaction
      post.userReactions.set(userId, emoji);

      // Notify post owner when someone reacts to their post
      if (post.user.toString() !== userId.toString()) {
        await createNotification(
          String(post.user),
          userId,
          'like',
          emoji,
          String(post._id)
        );
      }
    }

    await post.save();
    await post.populate('user', 'username name profilePicture');
    await post.populate('comments.user', 'username name profilePicture');

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPrivateSongs = async (req: Request, res: Response) => {
  try {
    const publicDir = frontendPublicDir;
    
    // Check if public directory exists
    if (!fs.existsSync(publicDir)) {
      return res.json([]);
    }
    
    // Read files from public directory
    const files = fs.readdirSync(publicDir);
    
    // Filter for audio files
    const audioExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac'];
    const songs = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return audioExtensions.includes(ext);
    });
    
    res.json(songs);
  } catch (error) {
    console.error('Error reading songs:', error);
    res.status(500).json({ message: 'Failed to fetch songs' });
  }
};
