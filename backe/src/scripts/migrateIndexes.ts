import mongoose from 'mongoose';
import RoomComment from '../models/RoomComment.js';
import Group from '../models/Group.js';
import User from '../models/User.js';

export async function migrateRoomCommentIndexes() {
  const db = mongoose.connection.db;
  const collName = 'roomcomments';
  try {
    const collections = await db.listCollections({ name: collName }).toArray();
    if (collections.length === 0) {
      console.log(`[migrate] Collection ${collName} does not exist yet.`);
      return;
    }

    const coll = db.collection(collName);
    const indexes = await coll.indexes();
    // Drop any TTL index on createdAt
    for (const idx of indexes) {
      if (idx.key && idx.key.createdAt) {
        try {
          await coll.dropIndex(idx.name);
          console.log(`[migrate] Dropped old TTL/index on createdAt: ${idx.name}`);
        } catch (e: any) {
          console.warn(`[migrate] Failed to drop index ${idx.name}:`, e.message || e);
        }
      }
    }

    // Ensure indexes defined by mongoose model are created (this will create expiresAt TTL)
    try {
      await RoomComment.createIndexes();
      console.log('[migrate] Ensured RoomComment indexes');
    } catch (e) {
      console.warn('[migrate] createIndexes failed:', e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    console.error('[migrate] Error migrating RoomComment indexes:', e);
  }
}

export async function migrateGroupIndexes() {
  const db = mongoose.connection.db;
  const collName = 'groups';

  try {
    const collections = await db.listCollections({ name: collName }).toArray();
    if (collections.length === 0) {
      console.log(`[migrate] Collection ${collName} does not exist yet.`);
      return;
    }

    const coll = db.collection(collName);

    // 1) Clean up any PUBLIC groups with a malformed location object (e.g. {type:"Point"} with no coordinates).
    try {
      const cleanupRes = await coll.updateMany(
        { groupType: 'PUBLIC', 'location.coordinates': { $exists: false } },
        { $unset: { location: '' } }
      );
      if (cleanupRes.modifiedCount > 0) {
        console.log(`[migrate] Unset malformed location on PUBLIC groups: ${cleanupRes.modifiedCount}`);
      }
    } catch (e: any) {
      console.warn('[migrate] Failed to cleanup PUBLIC group locations:', e?.message || e);
    }

    // 2) Ensure 2dsphere index is partial (LOCAL-only). Older deployments might have a non-partial 2dsphere index
    // which rejects any document with `location` present but invalid.
    const indexes = await coll.indexes();
    for (const idx of indexes) {
      const isGeoIdx = idx?.key && (idx.key as any).location === '2dsphere';
      if (!isGeoIdx) continue;

      const partial = (idx as any).partialFilterExpression;
      const desiredPartial = { groupType: 'LOCAL', 'location.coordinates': { $type: 'array' } };
      const matchesDesired = JSON.stringify(partial || {}) === JSON.stringify(desiredPartial);

      if (!matchesDesired) {
        try {
          await coll.dropIndex(idx.name);
          console.log(`[migrate] Dropped old Group geo index: ${idx.name}`);
        } catch (e: any) {
          console.warn(`[migrate] Failed to drop index ${idx.name}:`, e?.message || e);
        }
      }
    }

    try {
      await Group.createIndexes();
      console.log('[migrate] Ensured Group indexes');
    } catch (e) {
      console.warn('[migrate] Group.createIndexes failed:', e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    console.error('[migrate] Error migrating Group indexes:', e);
  }
}

export async function migrateUserIndexes() {
  const db = mongoose.connection.db;
  const collName = 'users';
  try {
    const collections = await db.listCollections({ name: collName }).toArray();
    if (collections.length === 0) {
      console.log(`[migrate] Collection ${collName} does not exist yet.`);
      return;
    }

    const coll = db.collection(collName);
    const indexes = await coll.indexes();
    for (const idx of indexes) {
      if (idx?.key && (idx.key as any).username === 1 && !idx.unique) {
        try {
          await coll.dropIndex(idx.name);
          console.log(`[migrate] Dropped old non-unique username index: ${idx.name}`);
        } catch (e: any) {
          console.warn(`[migrate] Failed to drop index ${idx.name}:`, e.message || e);
        }
      }
    }

    try {
      await User.createIndexes();
      console.log('[migrate] Ensured User indexes');
    } catch (e) {
      console.warn('[migrate] User.createIndexes failed:', e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    console.error('[migrate] Error migrating User indexes:', e);
  }
}
