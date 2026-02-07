import { Response } from 'express';
import Status from '../models/Status.js';
import User from '../models/User.js';
import { ioInstance } from '../socket/index.js';
import { AuthRequest } from '../middleware/auth.js';


export const createStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { content, mediaUrl, songUrl } = req.body;
    const userId = req.user._id;

    if (!content && !mediaUrl && !songUrl) return res.status(400).json({ message: 'Nothing to post' });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const status = new Status({ userId, content, mediaUrl, songUrl, expiresAt });
    await status.save();

    // Notify nearby users (within 2KM)
    try {
      const user = await User.findById(userId);
      if (user && user.location && user.location.coordinates) {
        const coords = user.location.coordinates as [number, number];
        const nearby = await User.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: coords },
              distanceField: 'dist',
              spherical: true,
              maxDistance: 2000,
            },
          },
          { $project: { _id: 1 } },
        ]);

        const ids = nearby.map((u: any) => String(u._id));
        ids.forEach((id: string) => {
          ioInstance?.to(`user:${id}`).emit('status:new', {
            id: status._id,
            userId,
            content,
            mediaUrl,
            songUrl,
            expiresAt,
            createdAt: status.createdAt,
          });
        });
      }
    } catch (err) {
      console.warn('Failed to notify nearby users about status', err);
    }

    res.json({ ok: true, statusId: status._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const status = await Status.findById(id);
    if (!status) return res.status(404).json({ message: 'Status not found' });
    if (String(status.userId) !== String(req.user._id)) return res.status(403).json({ message: 'Not allowed' });

    await Status.findByIdAndDelete(id);

    // notify clients so they can remove the status from UI
    try {
      ioInstance?.emit('status:deleted', { id });
    } catch (err) {
      console.warn('Failed to emit status:deleted', err);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const listNearbyStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'Missing params' });
    const coords: [number, number] = [parseFloat(lng as string), parseFloat(lat as string)];

    // Find users within 2KM
    const nearby = await User.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: coords },
          distanceField: 'dist',
          spherical: true,
          maxDistance: 2000,
        },
      },
      { $project: { _id: 1 } },
    ]);

    const ids = nearby.map((u: any) => u._id);
    // Include the current user's ID to show their own statuses
    ids.push(req.user._id);

    //  const statuses = await Status.find({ userId: { $in: ids } }).sort({ createdAt: -1 }).limit(50).allowDiskUse(true).lean();
    const statuses = await Status.find({ userId: { $in: ids } })
      .select("userId content mediaUrl songUrl createdAt expiresAt views viewers")
      .populate('viewers', 'username name')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Only include views/viewers for the owner of a status
    const sanitized = statuses.map((s: any) => {
      if (String(s.userId) === String(req.user._id)) return s;
      const copy = { ...s };
      delete (copy as any).views;
      delete (copy as any).viewers;
      return copy;
    });

    res.json({ statuses: sanitized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const recordView = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const status = await Status.findById(id);
    if (!status) return res.status(404).json({ message: 'Status not found' });
    // Do not record views when the owner views their own status
    if (String(userId) === String(status.userId)) {
      return res.json({ ok: true });
    }

    // if viewer not already present, add and increment views
    const already = (status.viewers || []).some((v: any) => String(v) === String(userId));
    if (!already) {
      status.viewers = status.viewers || [];
      status.viewers.push(userId);
      status.views = (status.views || 0) + 1;
      await status.save();

      // notify creator in real-time
      try {
        console.log('Emitting status:view to creator', { statusId: String(status._id), creator: String(status.userId), by: String(userId) });
        ioInstance?.to(`user:${String(status.userId)}`).emit('status:view', { id: status._id, by: userId });
      } catch (err) {
        console.warn('Failed to emit status:view', err);
      }
    }

    // do not return viewers/views to the viewer; creator will be notified via socket
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getStatusById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const status = await Status.findById(id).populate('viewers', 'username name').lean();
    if (!status) return res.status(404).json({ message: 'Status not found' });

    // Only return views/viewers to the owner
    if (String(status.userId) !== String(req.user._id)) {
      const copy = { ...status };
      delete (copy as any).views;
      delete (copy as any).viewers;
      return res.json({ status: copy });
    }

    return res.json({ status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
