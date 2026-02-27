import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import Report from '../models/report.js';

const normalizeReason = (v: any) => {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.slice(0, 1000);
};

export const reportPost = async (req: AuthRequest, res: Response) => {
  try {
    const reporterId = req.user?._id;
    const { postId } = req.params as any;
    const reason = normalizeReason((req.body as any)?.reason);

    if (!reporterId) return res.status(401).json({ message: 'Unauthorized' });
    if (!postId) return res.status(400).json({ message: 'Missing postId' });
    if (!reason) return res.status(400).json({ message: 'Reason is required' });

    const post = await Post.findById(postId).select('_id user').lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Don't allow reporting your own post
    if (String(post.user) === String(reporterId)) {
      return res.status(400).json({ message: 'You cannot report your own post' });
    }

    const already = await Report.exists({ reporterId, targetType: 'post', postId: post._id });
    if (already) {
      return res.status(409).json({ message: 'You already reported this post' });
    }

    const reported = await User.findById(post.user).select('username').lean();

    const report = await Report.create({
      reporterId,
      targetType: 'post',
      postId: post._id,
      reportedUserId: post.user,
      reportedUsername: (reported as any)?.username || undefined,
      reason,
      status: 'pending',
    });

    const reportCount = await Report.countDocuments({ targetType: 'post', postId: post._id });

    let deleted = false;
    if (reportCount >= 20) {
      const deletedPost = await Post.findByIdAndDelete(post._id);
      deleted = !!deletedPost;
    }

    return res.status(201).json({ ok: true, reportId: report._id, reportCount, deleted });
  } catch (err) {
    // Handle duplicate reports (unique index)
    if ((err as any)?.code === 11000) {
      return res.status(409).json({ message: 'You already reported this post' });
    }
    console.error('reportPost error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const reportUser = async (req: AuthRequest, res: Response) => {
  try {
    const reporterId = req.user?._id;
    const { userId } = req.params as any;
    const reason = normalizeReason((req.body as any)?.reason);

    if (!reporterId) return res.status(401).json({ message: 'Unauthorized' });
    if (!userId) return res.status(400).json({ message: 'Missing userId' });
    if (!reason) return res.status(400).json({ message: 'Reason is required' });

    if (String(userId) === String(reporterId)) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    const reported = await User.findById(userId).select('username').lean();
    if (!reported) return res.status(404).json({ message: 'User not found' });

    const already = await Report.exists({ reporterId, targetType: 'user', reportedUserId: userId });
    if (already) {
      return res.status(409).json({ message: 'You already reported this user' });
    }

    const report = await Report.create({
      reporterId,
      targetType: 'user',
      reportedUserId: userId,
      reportedUsername: (reported as any)?.username || undefined,
      reason,
      status: 'pending',
    });

    return res.status(201).json({ ok: true, reportId: report._id });
  } catch (err) {
    if ((err as any)?.code === 11000) {
      return res.status(409).json({ message: 'You already reported this user' });
    }
    console.error('reportUser error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
