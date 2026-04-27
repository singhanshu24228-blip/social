import { Response } from 'express';
import Community from '../models/Community.js';
import Post from '../models/Post.js';
import { AuthRequest } from '../middleware/auth.js';

const normalizeName = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizePurpose = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');

const serializeCommunity = (community: any, userId?: any) => ({
  id: community._id,
  name: community.name,
  purpose: community.purpose || '',
  profilePicture: community.profilePicture || '',
  memberCount: Array.isArray(community.members) ? community.members.length : Number(community.memberCount || 0),
  isMember: userId ? (community.members || []).some((m: any) => String(m) === String(userId)) : false,
  isCreator: userId ? String(community.createdBy || '') === String(userId) : false,
});

export const createCommunity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const name = normalizeName(req.body?.name);
    const purpose = normalizePurpose(req.body?.purpose);
    const profilePicture = String(req.body?.profilePicture || '').trim();

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!name) return res.status(400).json({ message: 'Community name is required' });
    if (name.length < 3 || name.length > 40) return res.status(400).json({ message: 'Community name must be 3-40 characters' });
    if (!/^[A-Za-z0-9 _.-]+$/.test(name)) return res.status(400).json({ message: 'Community name contains invalid characters' });
    if (purpose.length > 240) return res.status(400).json({ message: 'Purpose must be 240 characters or fewer' });

    const exists = await Community.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
    if (exists) return res.status(409).json({ message: 'Community name already exists' });

    const community = await Community.create({
      name,
      purpose: purpose || undefined,
      profilePicture: profilePicture || undefined,
      createdBy: userId,
      members: [userId],
    });

    res.status(201).json({ community: serializeCommunity(community, userId) });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Community name already exists' });
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listMyCommunities = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const communities = await Community.find({ members: userId }).sort({ updatedAt: -1 }).limit(50).lean();
    res.json({ communities: (communities || []).map((community: any) => serializeCommunity(community, userId)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listCommunities = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const communities = await Community.find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ communities: (communities || []).map((community: any) => serializeCommunity(community, userId)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const searchCommunities = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const q = normalizeName(req.query?.q);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!q) return res.json({ communities: [] });

    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const communities = await Community.find({ name: rx }).sort({ name: 1 }).limit(20).lean();
    res.json({ communities: (communities || []).map((community: any) => serializeCommunity(community, userId)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const joinCommunity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { communityId } = req.params;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ message: 'Community not found' });

    if (!(community.members || []).some((m: any) => String(m) === String(userId))) {
      community.members.push(userId);
      await community.save();
    }

    res.json({ ok: true, community: serializeCommunity(community, userId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getCommunityDetails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { communityId } = req.params;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const community = await Community.findById(communityId)
      .populate('createdBy', '_id username name profilePicture')
      .populate('members', '_id username name profilePicture')
      .lean();
    if (!community) return res.status(404).json({ message: 'Community not found' });

    res.json({
      community: {
        ...serializeCommunity(community, userId),
        createdBy: community.createdBy,
        members: community.members || [],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateCommunity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { communityId } = req.params;
    const name = normalizeName(req.body?.name);
    const purpose = normalizePurpose(req.body?.purpose);
    const profilePicture = String(req.body?.profilePicture || '').trim();
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ message: 'Community not found' });
    if (String(community.createdBy) !== String(userId)) return res.status(403).json({ message: 'Only the community admin can update this community' });

    if (name) {
      if (name.length < 3 || name.length > 40) return res.status(400).json({ message: 'Community name must be 3-40 characters' });
      if (!/^[A-Za-z0-9 _.-]+$/.test(name)) return res.status(400).json({ message: 'Community name contains invalid characters' });
      const exists = await Community.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
      if (exists && String((exists as any)._id) !== String(communityId)) return res.status(409).json({ message: 'Community name already exists' });
      community.name = name;
    }
    if (purpose.length > 240) return res.status(400).json({ message: 'Purpose must be 240 characters or fewer' });
    community.purpose = purpose || undefined;
    community.profilePicture = profilePicture || undefined;
    await community.save();

    res.json({ ok: true, community: serializeCommunity(community, userId) });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Community name already exists' });
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeCommunityMember = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { communityId, memberId } = req.params;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ message: 'Community not found' });
    if (String(community.createdBy) !== String(userId)) return res.status(403).json({ message: 'Only the community admin can remove members' });
    if (String(memberId) === String(userId)) return res.status(400).json({ message: 'Admin cannot remove themselves from the community' });

    community.members = (community.members || []).filter((member: any) => String(member) !== String(memberId));
    await community.save();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteCommunity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    const { communityId } = req.params;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ message: 'Community not found' });
    if (String(community.createdBy) !== String(userId)) return res.status(403).json({ message: 'Only the community admin can delete this community' });

    await Post.deleteMany({ community: community._id });
    await Community.findByIdAndDelete(community._id);
    res.json({ ok: true, communityId: String(community._id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
