import mongoose from 'mongoose';
import RoomComment from '../models/RoomComment.js';

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
