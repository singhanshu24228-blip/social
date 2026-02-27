import { Response } from 'express';
import Group from '../models/Group.js';
import User from '../models/User.js';
import { AuthRequest } from '../middleware/auth.js';

export async function deriveAreaAndPincode(lat: number, lng: number): Promise<{ areaCode: string; pincode: string }> {
  try {
    // First, get area from Nominatim
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
    const nomRes = await fetch(nominatimUrl, {
  headers: {
    'User-Agent': process.env.NOMINATIM_USER_AGENT || 'contact-local-backend/0.1',
    'Accept-Language': 'en',
  },
});


    let area = '';
    if (nomRes.ok) {
      const nomJson = await nomRes.json();
      const addr = nomJson.address || {};
      area = addr.suburb || addr.city_district || addr.town || addr.city || addr.village || addr.hamlet || addr.county || addr.state || addr.country || '';
    }

    // Get postcode from GeoNames
    // const geonamesUrl = `http://api.geonames.org/findNearbyPostalCodesJSON?lat=${lat}&lng=${lng}&username=demo&maxRows=1`;
    const geonamesUrl =
  `http://api.geonames.org/findNearbyPostalCodesJSON?lat=${lat}&lng=${lng}&username=${process.env.GEONAMES_USERNAME}&maxRows=1`;

    const geoRes = await fetch(geonamesUrl);

    let postcode = '';
    if (geoRes.ok) {
      const geoJson = await geoRes.json();
      const postalCodes = geoJson.postalCodes || [];
      if (postalCodes.length > 0) {
        postcode = postalCodes[0].postalCode || '';
      }
    }

    if (!postcode) {
      // fallback pseudo pincode using both lat and lng for better accuracy
      const p = (Math.abs(Math.floor((lat * 1000 + lng * 1000))) % 900000) + 100000;
      postcode = String(p).slice(0, 6);
    } else if (postcode.length > 6) {
      postcode = postcode.replace(/\s+/g, '').slice(0, 6);
    }

    const normalizedArea = (area.replace(/[^A-Za-z]/g, '')).toUpperCase().slice(0, 3) || 'LOC';
    return { areaCode: normalizedArea, pincode: postcode };
  } catch (err) {
    console.warn('Geocoding failed', err);
    // fallback on error
    const p = (Math.abs(Math.floor(lat * 1000)) % 900000) + 100000;
    return { areaCode: 'LOC', pincode: String(p).slice(0, 6) };
  }
}

export const ensureGroupsForLocation = async (coords: [number, number], _ensureMemberUserId?: string) => {
  const [lng, lat] = coords;
  const { areaCode, pincode } = await deriveAreaAndPincode(lat, lng);

  const ranges: Array<{ key: '1KM' | '2KM'; maxDistance: number }> = [
    { key: '1KM', maxDistance: 1000 },
    { key: '2KM', maxDistance: 2000 },
  ];

  const created: any[] = [];

  for (const r of ranges) {
    const groupName = `${areaCode}-${pincode}-${r.key}`;
    let group = await Group.findOne({ groupName });
    if (!group) {
      group = new Group({
        groupName,
        areaCode,
        pincode,
        distanceRange: r.key,
        location: { type: 'Point', coordinates: coords },
        members: [],
      });
      await group.save();
      created.push(group);
    }

    // Populate members: add users whose location is within the group's maxDistance
    try {
      const usersWithin = await User.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: coords },
            distanceField: 'dist',
            spherical: true,
            maxDistance: r.maxDistance,
          },
        },
        { $project: { _id: 1 } },
      ]);

      const ids = (usersWithin || []).map((u: any) => u._id);
      if (ids.length > 0) {
        await Group.findByIdAndUpdate(group._id, { $addToSet: { members: { $each: ids } } });
      }
    } catch (err) {
      console.warn('Failed to populate group members', err);
    }
  }

  return created;
};

export const listAvailableGroups = async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'Missing params' });
    const coords: [number, number] = [parseFloat(lng as string), parseFloat(lat as string)];

    // Find groups near the user and return at most one per distanceRange (1KM + 2KM).
    // This prevents multiple nearby pincodes/areas from producing many groups in the UI.
    const groups = await Group.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: coords },
          distanceField: 'dist',
          spherical: true,
          maxDistance: 2000,
        },
      },
      {
        $match: {
          $or: [
            { distanceRange: '1KM', dist: { $lte: 1000 } },
            { distanceRange: '2KM', dist: { $lte: 2000 } },
          ],
        },
      },
      {
        $project: {
          members: 0,
        },
      },
      { $sort: { dist: 1 } },
    ]);

    const byRange = new Map<string, any>();
    for (const g of groups as any[]) {
      if (!byRange.has(g.distanceRange)) byRange.set(g.distanceRange, g);
      if (byRange.size >= 2) break;
    }
    const uniqueGroups = Array.from(byRange.values()).sort((a: any, b: any) => a.dist - b.dist);

    // For each group, determine if user is a member
    const userId = req.user?._id;
    const userGroups = await Group.find({ members: userId }).select('_id').lean();
    const memberSet = new Set((userGroups || []).map((g: any) => String(g._id)));

    const resGroups = uniqueGroups.map((g: any) => ({
      id: g._id,
      groupName: g.groupName,
      areaCode: g.areaCode,
      pincode: g.pincode,
      distanceRange: g.distanceRange,
      distanceMeters: Math.round(g.dist),
      isMember: memberSet.has(String(g._id)),
    }));

    res.json({ groups: resGroups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const joinGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Ensure user is within allowed range to join
    const user = await User.findById(userId);
    if (!user || !user.location) return res.status(400).json({ message: 'User location required' });
    function haversine([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
      const R = 6371e3; // meters
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    const distance = haversine(user.location.coordinates as [number, number], group.location.coordinates as [number, number]);
    const allowed = group.distanceRange === '1KM' ? distance <= 1000 : distance <= 2000;
    if (!allowed) return res.status(403).json({ message: 'You are not within allowed distance to join this group' });

    const already = group.members.find((m: any) => String(m) === String(userId));
    if (already) return res.json({ ok: true, message: 'Already a member' });

    group.members.push(userId);
    await group.save();

    res.json({ ok: true, groupId: group._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getGroupMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const GroupMessage = (await import('../models/GroupMessage.js')).default;
    const msgs = await GroupMessage.find({ groupId }).sort({ createdAt: 1 }).allowDiskUse(true).populate('senderId', 'username name').lean();

    // Normalize sender field
    const out = msgs.map((m: any) => ({
      id: m._id,
      groupId: m.groupId,
      senderId: m.senderId?._id || m.senderId,
      sender: m.senderId ? { id: m.senderId._id, username: m.senderId.username, name: m.senderId.name } : undefined,
      message: m.message,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      createdAt: m.createdAt,
      status: m.status,
    }));

    res.json({ messages: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const leaveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    group.members = group.members.filter((m) => String(m) !== String(userId));
    await group.save();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
