import { Response } from 'express';
import Group from '../models/Group.js';
import User from '../models/User.js';
import { AuthRequest } from '../middleware/auth.js';

const isProd = process.env.NODE_ENV === 'production';
const internalErrorMessage = (err: unknown, fallback: string) => {
  if (!isProd && err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as any).message || '').trim();
    if (msg) return msg;
  }
  return fallback;
};

export const listAvailableGroups = async (req: AuthRequest, res: Response) => {
  try {
    const authUserId = req.user?._id;

    if (!authUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const groups = await Group.find({
      groupType: 'PUBLIC',
      $or: [{ createdBy: authUserId }, { members: authUserId }],
    })
      .select('_id groupName members createdBy')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const memberSet = new Set<string>();
    for (const g of groups) {
      if ((g.members || []).some((m: any) => String(m) === String(authUserId))) {
        memberSet.add(String(g._id));
      }
    }

    const resGroups = (groups || []).map((g: any) => ({
      id: g._id,
      groupName: g.groupName,
      groupType: 'PUBLIC',
      distanceRange: 'PUBLIC',
      distanceMeters: 0,
      isMember: memberSet.has(String(g._id)),
      isCreator: String(g.createdBy) === String(authUserId),
    }));

    res.json({ groups: resGroups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

const normalizeGroupName = (name: unknown) => String(name || '').trim().replace(/\s+/g, ' ');

export const createPublicGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const groupName = normalizeGroupName(req.body?.groupName);

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!groupName) return res.status(400).json({ message: 'Group name is required' });
    if (groupName.length < 3 || groupName.length > 40) {
      return res.status(400).json({ message: 'Group name must be 3-40 characters' });
    }

    if (!/^[A-Za-z0-9 _.-]+$/.test(groupName)) {
      return res.status(400).json({ message: 'Group name contains invalid characters' });
    }

    const exists = await Group.findOne({ groupName: new RegExp(`^${groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('_id groupName')
      .lean();
    if (exists) return res.status(409).json({ message: 'Group name already exists' });

    const group = new Group({
      groupName,
      groupType: 'PUBLIC',
      createdBy: userId,
      members: [userId],
      location: undefined,
    });

    await group.save();

    res.status(201).json({
      group: {
        id: group._id,
        groupName: group.groupName,
        groupType: group.groupType,
        isMember: true,
        isCreator: true,
      },
    });
  } catch (err) {
    const anyErr: any = err;
    if (anyErr?.code === 16755) {
      return res.status(500).json({
        message:
          'Group index mismatch on server. Please restart the backend once so it can migrate Group indexes, then retry.',
      });
    }
    if (anyErr?.code === 11000) {
      return res.status(409).json({ message: 'Group name already exists' });
    }

    console.error(err);
    return res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const searchPublicGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const q = normalizeGroupName(req.query?.q);

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!q) return res.json({ groups: [] });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');

    const groups = await Group.find({ groupType: 'PUBLIC', groupName: rx })
      .select('_id groupName members')
      .sort({ groupName: 1 })
      .limit(20)
      .lean();

    const out = (groups || []).map((g: any) => ({
      id: g._id,
      groupName: g.groupName,
      groupType: 'PUBLIC',
      isMember: (g.members || []).some((m: any) => String(m) === String(userId)),
    }));

    res.json({ groups: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const listMyGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const type = String(req.query?.type || 'all').toLowerCase();

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const filter: any = { members: userId };
    if (type === 'public') filter.groupType = 'PUBLIC';
    if (type === 'local') filter.groupType = 'LOCAL';

    const groups = await Group.find(filter).select('_id groupName groupType createdBy').sort({ updatedAt: -1 }).limit(50).lean();
    res.json({
      groups: (groups || []).map((g: any) => ({
        id: g._id,
        groupName: g.groupName,
        groupType: g.groupType || 'LOCAL',
        isMember: true,
        isCreator: String(g.createdBy || '') === String(userId),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const joinPublicGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?._id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.groupType !== 'PUBLIC') return res.status(400).json({ message: 'Not a public group' });

    const already = group.members.find((m: any) => String(m) === String(userId));
    if (already) return res.json({ ok: true, message: 'Already a member' });

    group.members.push(userId);
    await group.save();

    res.json({ ok: true, groupId: group._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const getGroupMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const group = await Group.findById(groupId).select('members').lean();
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = (group.members || []).some((m: any) => String(m) === String(userId));
    if (!isMember) return res.status(403).json({ message: 'You are not a member of this group' });

    const GroupMessage = (await import('../models/GroupMessage.js')).default;
    const msgs = await GroupMessage.find({ groupId })
      .sort({ createdAt: 1 })
      .allowDiskUse(true)
      .populate('senderId', 'username name')
      .lean();

    const out = msgs.map((m: any) => ({
      id: m._id,
      groupId: m.groupId,
      senderId: m.senderId?._id || m.senderId,
      sender: m.senderId ? { id: m.senderId._id, username: m.senderId.username, name: m.senderId.name } : undefined,
      message: m.message,
      e2ee: m.e2ee || undefined,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      createdAt: m.createdAt,
      status: m.status,
    }));

    res.json({ messages: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const getGroupE2EEKeys = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?._id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const group = await Group.findById(groupId).select('members').lean();
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = (group.members || []).some((m: any) => String(m) === String(userId));
    if (!isMember) return res.status(403).json({ message: 'You are not a member of this group' });

    const members = await User.find({ _id: { $in: group.members || [] } })
      .select('_id username name e2eePublicKey e2eeKeyId e2eeUpdatedAt')
      .lean();

    res.json({
      members: (members || []).map((member: any) => ({
        userId: member._id,
        username: member.username,
        name: member.name,
        publicKey: member.e2eePublicKey || null,
        keyId: member.e2eeKeyId || null,
        updatedAt: member.e2eeUpdatedAt || null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const joinGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if ((group as any).groupType === 'PUBLIC') {
      return res.status(400).json({ message: 'Use the public join endpoint for this group' });
    }
    if (!group.location?.coordinates || group.location.coordinates.length !== 2) {
      return res.status(400).json({ message: 'Group location missing' });
    }

    const user = await User.findById(userId);
    if (!user || !user.location) return res.status(400).json({ message: 'User location required' });
    function haversine([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
      const R = 6371e3;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    const distance = haversine(
      user.location.coordinates as [number, number],
      group.location.coordinates as [number, number]
    );
    const allowed = group.distanceRange === '1KM' ? distance <= 1000 : distance <= 2000;
    if (!allowed) return res.status(403).json({ message: 'You are not within allowed distance to join this group' });

    const already = group.members.find((m: any) => String(m) === String(userId));
    if (already) return res.json({ ok: true, message: 'Already a member' });

    group.members.push(userId);
    await group.save();

    res.json({ ok: true, groupId: group._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const leaveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    group.members = group.members.filter((m: any) => String(m) !== String(userId));
    await group.save();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user?._id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.groupType !== 'PUBLIC') {
      return res.status(400).json({ message: 'Only public groups can be deleted manually' });
    }
    if (String(group.createdBy || '') !== String(userId)) {
      return res.status(403).json({ message: 'Only the group creator can delete this group' });
    }

    const GroupMessage = (await import('../models/GroupMessage.js')).default;
    await GroupMessage.deleteMany({ groupId: group._id });
    await Group.findByIdAndDelete(group._id);

    res.json({ ok: true, groupId: String(group._id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: internalErrorMessage(err, 'Server error') });
  }
};
