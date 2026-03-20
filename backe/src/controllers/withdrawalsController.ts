import { Response } from 'express';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import User from '../models/User.js';
import { AuthRequest } from '../middleware/auth.js';

const MAX_WITHDRAWAL_AMOUNT = Number(process.env.MAX_WITHDRAWAL_AMOUNT || 100000);

export const createWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    const amountRaw = (req.body as any)?.amount;
    const amount = Number(amountRaw);
    const accountInfo = (req.body as any)?.accountInfo || {};
    const accountHolderName = String(accountInfo.accountHolderName || '').trim();
    const bankName = String(accountInfo.bankName || '').trim();
    const accountNumber = String(accountInfo.accountNumber || '').trim();
    const ifsc = String(accountInfo.ifsc || '').trim();
    const upiId = String(accountInfo.upiId || '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid withdrawal amount' });
    }
    if (amount > MAX_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({ message: `Amount exceeds limit (${MAX_WITHDRAWAL_AMOUNT})` });
    }

    const missingFields: string[] = [];
    if (!accountHolderName) missingFields.push('accountHolderName');
    if (!bankName) missingFields.push('bankName');
    if (!accountNumber) missingFields.push('accountNumber');
    if (!ifsc && !upiId) missingFields.push('ifsc or upiId');
    if (missingFields.length) {
      return res.status(400).json({
        message: `Missing required account details: ${missingFields.join(', ')}`,
      });
    }

    const user = await User.findById(userId).select('_id totalEarnings withdrawnTotal username').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const totalEarnings = Number((user as any).totalEarnings || 0);
    const withdrawnTotal = Number((user as any).withdrawnTotal || 0);

    const pendingAgg = await WithdrawalRequest.aggregate([
      { $match: { userId: user._id, status: 'pending' } },
      { $group: { _id: null, sum: { $sum: '$amount' } } },
    ]);
    const pendingTotal = Number(pendingAgg?.[0]?.sum || 0);

    const available = Math.max(0, totalEarnings - withdrawnTotal - pendingTotal);
    if (amount > available) {
      return res.status(400).json({ message: `Insufficient available balance (₹${available})` });
    }

    const withdrawal = await WithdrawalRequest.create({
      userId: user._id,
      username: (user as any).username,
      totalMoney: totalEarnings,
      amount,
      accountInfo: {
        accountHolderName,
        bankName,
        accountNumber,
        ifsc,
        upiId,
      },
      status: 'pending',
    });

    res.status(201).json({ ok: true, withdrawal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMyWithdrawals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user._id.toString();
    const list = await WithdrawalRequest.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ withdrawals: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
