import User from '../models/User.js';

export async function isEitherUserBlocked(userAId: string, userBId: string): Promise<boolean> {
  if (!userAId || !userBId) return false;
  if (String(userAId) === String(userBId)) return false;

  const [aBlocksB, bBlocksA] = await Promise.all([
    User.exists({ _id: userAId, blockedUsers: userBId }),
    User.exists({ _id: userBId, blockedUsers: userAId }),
  ]);

  return Boolean(aBlocksB || bBlocksA);
}

// Returns a union of:
// - users the viewer has blocked
// - users who have blocked the viewer
export async function getBlockedUserIdsForViewer(viewerId: string): Promise<string[]> {
  if (!viewerId) return [];

  const viewer = await User.findById(viewerId).select('blockedUsers').lean();
  const blockedByViewer = (viewer as any)?.blockedUsers ? (viewer as any).blockedUsers.map((id: any) => String(id)) : [];

  const blockedViewerDocs = await User.find({ blockedUsers: viewerId }).select('_id').lean();
  const blockedByOthers = blockedViewerDocs.map((u: any) => String(u._id));

  return Array.from(new Set([...blockedByViewer, ...blockedByOthers]));
}

