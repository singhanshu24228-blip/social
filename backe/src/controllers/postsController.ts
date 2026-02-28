import { Request, Response } from 'express';
import path from 'path';
import Post, { IPost } from '../models/Post.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import { calculateScore } from '../utils/yourVoiceAI.js';
import fs from 'fs';
import { uploadsDir, frontendPublicDir } from '../utils/paths.js';
import { isCloudinaryConfigured, uploadFileToCloudinary } from '../utils/cloudinary.js';

const isProd = process.env.NODE_ENV === 'production';
const debugPosts = !isProd && process.env.DEBUG_POSTS?.trim() === 'true';

export const createPost = async (req: Request, res: Response) => {
  try {
    const { content, anonymous } = req.body;
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
          imageUrl = `/uploads/${file.filename}`;
        }
      } else {
        imageUrl = `/uploads/${file.filename}`;
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
          songUrl = `/uploads/${sfile.filename}`;
        }
      } else {
        songUrl = `/uploads/${sfile.filename}`;
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
    if (debugPosts) {
      console.log('Backend createPost - saving with:', { content, imageUrl, songUrl, userId, anonymous: anonFlag });
    }

    // Fetch user to get username
    const user = await User.findById(userId);
    const username = user?.username || '';

    const post = new Post({
      user: userId,
      username,
      content,
      imageUrl,
      songUrl,
      anonymous: anonFlag,
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
    
    const posts = await Post.find({ isNightPost: { $ne: true } })
      .populate('user', 'username name')
      .populate('comments.user', 'username name')
      .sort({ createdAt: -1 })
      .allowDiskUse(true);

    // Calculate scores and sort by score (highest first)
    const postsWithScores = posts.map(post => {
      const postObj = post.toObject() as IPost;
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
      .populate('user', 'username name')
      .populate('comments.user', 'username name');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.json(post);
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
    ).populate('user', 'username name');

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
    await post.populate('user', 'username name');
    await post.populate('comments.user', 'username name');

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

    await post.populate('user', 'username name');
    await post.populate('comments.user', 'username name');

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPostsByUsername = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const user = await import('../models/User.js').then(m => m.default.findOne({ username }));

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const posts = await Post.find({ user: user._id })
      .populate('user', 'username name')
      .populate('comments.user', 'username name')
      .sort({ createdAt: -1 })
      .allowDiskUse(true);

    // Calculate scores and sort by score (highest first)
    const postsWithScores = posts.map(post => {
      const postObj = post.toObject();
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
    await post.populate('user', 'username name');
    await post.populate('comments.user', 'username name');

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
