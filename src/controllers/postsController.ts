import { Request, Response } from 'express';
import path from 'path';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { fileURLToPath } from 'url';
import { createNotification } from './notificationController.js';
import { calculateScore } from '../utils/yourVoiceAI.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createPost = async (req: Request, res: Response) => {
  try {
    const { content, anonymous } = req.body;
    const userId = (req as any).user._id;
    console.log('Backend createPost - req.body:', req.body);
    console.log('Backend createPost - req.files:', (req as any).files);

    // Build absolute base URL from request so frontend receives fully-qualified secure URLs
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const imageUrl = (req as any).files?.image
      ? `${baseUrl}/uploads/${(req as any).files.image[0].filename}`
      : req.body?.imageUrl
      ? (() => {
          let s = req.body.imageUrl as string;
          if (!s.startsWith('http')) {
            if (!s.startsWith('/')) {
              s = '/' + s;
            }
            return `${baseUrl}${s}`;
          }
          return s;
        })()
      : undefined;

    // allow using an uploaded file or an existing song URL passed in the body
    let songUrl: string | undefined;
    if ((req as any).files?.song) {
      songUrl = `${baseUrl}/uploads/${(req as any).files.song[0].filename}`;
    } else if (req.body?.songUrl) {
      let s = req.body.songUrl as string;
      // If passed a relative or incomplete path, construct absolute URL
      if (!s.startsWith('http')) {
        // Starts with / (frontend path) or is just a filename — construct as absolute URL
        if (!s.startsWith('/')) {
          s = '/' + s;
        }
        songUrl = `${baseUrl}${s}`;
      } else {
        // Already a full HTTP(S) URL
        songUrl = s;
      }
    } else {
      songUrl = undefined;
    }

    console.log('Backend createPost - computed URLs:', { baseUrl, imageUrl, songUrl });

    const anonFlag = (anonymous === 'true' || anonymous === true);
    console.log('Backend createPost - saving with:', { content, imageUrl, songUrl, userId, anonymous: anonFlag });

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

    console.log('Backend createPost - saved post object:', postObj);

    res.status(201).json(postObj);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPosts = async (req: Request, res: Response) => {
  try {
    // Filter out night posts from the daytime feed
    // Night posts should NEVER be visible in the normal feed
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

    // Sort by score but also consider recency - newer posts should appear higher
    // This ensures new posts aren't buried at the bottom
    postsWithScores.sort((a, b) => {
      const scoreA = (b.score || 0) - (a.score || 0);
      if (Math.abs(scoreA) > 0.1) {
        return scoreA;
      }
      // If scores are similar, sort by recency
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
    // Navigate from backe/src/controllers to root, then to frontend/public
    const backeDir = path.dirname(__dirname); // backe/src
    const rootDir = path.dirname(backeDir); // backe
    const projectRoot = path.dirname(rootDir); // project root
    const publicDir = path.join(projectRoot, 'frontend', 'public');
    
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