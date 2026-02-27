import mongoose, { Document, Schema } from 'mongoose';

export interface IFollower extends Document {
  followerId: mongoose.Types.ObjectId;
  followingId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let FollowerModel: any;

if (useInMemory) {
  type FollowerRecord = {
    _id: string;
    followerId: string;
    followingId: string;
    createdAt: Date;
    updatedAt: Date;
  };

  const followers = new Map<string, FollowerRecord>();

  class InMemoryFollower {
    _id: string;
    followerId: string;
    followingId: string;
    createdAt: Date;
    updatedAt: Date;

    constructor(data: any) {
      this._id = data?._id || new mongoose.Types.ObjectId().toHexString();
      this.followerId = data.followerId;
      this.followingId = data.followingId;
      this.createdAt = data.createdAt || new Date();
      this.updatedAt = data.updatedAt || new Date();
    }

    static __resetForTests() {
      followers.clear();
    }

    async save() {
      const rec: FollowerRecord = {
        _id: this._id,
        followerId: this.followerId,
        followingId: this.followingId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
      followers.set(this._id, rec);
      return this;
    }

    static async findOne(query: any) {
      for (const f of followers.values()) {
        if (query.followerId && query.followingId) {
          if (
            String(f.followerId) === String(query.followerId) &&
            String(f.followingId) === String(query.followingId)
          ) {
            return new InMemoryFollower(f);
          }
        }
      }
      return null;
    }

    static async find(query: any) {
      const results: IFollower[] = [];
      for (const f of followers.values()) {
        if (query.followerId && String(f.followerId) === String(query.followerId)) {
          results.push(new InMemoryFollower(f) as any);
        }
        if (query.followingId && String(f.followingId) === String(query.followingId)) {
          results.push(new InMemoryFollower(f) as any);
        }
      }
      return results;
    }

    static async findOneAndDelete(query: any) {
      for (const [key, f] of followers.entries()) {
        if (query.followerId && query.followingId) {
          if (
            String(f.followerId) === String(query.followerId) &&
            String(f.followingId) === String(query.followingId)
          ) {
            followers.delete(key);
            return new InMemoryFollower(f);
          }
        }
      }
      return null;
    }

    static async countDocuments(query: any) {
      let count = 0;
      for (const f of followers.values()) {
        if (query.followerId && String(f.followerId) === String(query.followerId)) count++;
        if (query.followingId && String(f.followingId) === String(query.followingId)) count++;
      }
      return count;
    }
  }

  FollowerModel = InMemoryFollower as any;
} else {
  const FollowerSchema = new Schema<IFollower>(
    {
      followerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
      followingId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
    },
    { timestamps: true }
  );

  // Unique compound index to prevent duplicate follows
  FollowerSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

  FollowerModel = mongoose.model<IFollower>('Follower', FollowerSchema);
}

export default FollowerModel;
