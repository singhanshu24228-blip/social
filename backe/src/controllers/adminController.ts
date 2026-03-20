import { Response } from 'express';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import User from '../models/User.js';
import { AuthRequest } from '../middleware/auth.js';

export const getAllWithdrawalRequests = async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query as any)?.status;
    const query: any = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    const withdrawals = await WithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ withdrawals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getWithdrawalRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const withdrawal = await WithdrawalRequest.findById(id).lean();

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    res.json({ withdrawal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const withdrawal = await WithdrawalRequest.findById(id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: `Cannot approve a ${withdrawal.status} request` });
    }

    // Update withdrawal status to approved
    withdrawal.status = 'approved';
    await withdrawal.save();

    // Update user's withdrawnTotal
    const user = await User.findById(withdrawal.userId);
    if (user) {
      (user as any).withdrawnTotal = ((user as any).withdrawnTotal || 0) + withdrawal.amount;
      await user.save();
    }

    res.json({ ok: true, withdrawal, message: 'Withdrawal approved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const rejectWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const reason = (req.body as any)?.reason || 'No reason provided';

    const withdrawal = await WithdrawalRequest.findById(id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ message: `Cannot reject a ${withdrawal.status} request` });
    }

    // Update withdrawal status to rejected
    withdrawal.status = 'rejected';
    await withdrawal.save();

    res.json({ ok: true, withdrawal, message: `Withdrawal rejected: ${reason}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createAdminUser = async (req: AuthRequest, res: Response) => {
  try {
    const rawEmail = String((req.body as any)?.email || '').trim().toLowerCase();
    const password = String((req.body as any)?.password || '');
    const name = String((req.body as any)?.name || 'Admin').trim() || 'Admin';

    if (!rawEmail || !password) {
      return res.status(400).json({ message: 'Missing email or password' });
    }

    // Basic email validation (avoid obvious garbage)
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    if (!emailOk) return res.status(400).json({ message: 'Invalid email' });

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: rawEmail }).select('_id').lean();
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const baseUsername =
      rawEmail
        .split('@')[0]
        .replace(/[^a-z0-9_]/gi, '')
        .slice(0, 20) || 'admin';

    let username = baseUsername;
    // Try a few times to avoid collisions (username isn't unique in schema, but avoiding duplicates helps UX).
    for (let i = 0; i < 5; i++) {
      const u = await User.findOne({ username }).select('_id').lean();
      if (!u) break;
      const suffix = Math.floor(1000 + Math.random() * 9000);
      username = `${baseUsername}${suffix}`.slice(0, 24);
    }

    const admin = new User({
      username,
      name,
      email: rawEmail,
      password,
      isAdmin: true,
      location: { type: 'Point', coordinates: [0, 0] },
      isOnline: false,
      following: [],
      followers: [],
    });

    await admin.save();

    res.status(201).json({
      ok: true,
      admin: {
        id: admin._id,
        email: admin.email,
        username: admin.username,
        name: admin.name,
        isAdmin: true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAdminUser = async (req: AuthRequest, res: Response) => {
  try {
    const rawEmail = String((req.body as any)?.email || '').trim().toLowerCase();
    const password = String((req.body as any)?.password || '');

    if (!rawEmail || !password) {
      return res.status(400).json({ message: 'Missing email or password' });
    }

    const target = await User.findOne({ email: rawEmail });
    if (!target) return res.status(404).json({ message: 'Admin not found' });
    if (!(target as any).isAdmin) return res.status(400).json({ message: 'User is not an admin' });

    // Prevent deleting the currently authenticated admin to avoid accidental lockout.
    if (String(target._id) === String(req.user?._id)) {
      return res.status(400).json({ message: 'You cannot delete your own admin account' });
    }

    const ok = await (target as any).comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    // Delete user; related data cleanup is intentionally minimal here.
    await User.deleteOne({ _id: target._id });

    // Best-effort: delete refresh tokens to force logout (if model exists).
    try {
      const RefreshToken = (await import('../models/RefreshToken.js')).default;
      await RefreshToken.deleteMany({ user: target._id });
    } catch {}

    res.json({ ok: true, message: `Admin deleted: ${rawEmail}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
