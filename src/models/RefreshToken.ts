import mongoose, { Document, Schema } from 'mongoose';

export interface IRefreshToken extends Document {
  tokenHash: string;
  user: any;
  expiresAt: Date;
  createdAt: Date;
}

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let RefreshTokenModel: any;

if (useInMemory) {
  type RefreshRecord = {
    _id: string;
    tokenHash: string;
    user: string;
    expiresAt: Date;
  };

  const records = new Map<string, RefreshRecord>();

  class InMemoryRefreshToken {
    _id: string;
    tokenHash: string;
    user: string;
    expiresAt: Date;

    constructor(data: any) {
      this._id = data?._id || new mongoose.Types.ObjectId().toHexString();
      this.tokenHash = data.tokenHash;
      this.user = String(data.user);
      this.expiresAt = new Date(data.expiresAt);
    }

    static __resetForTests() {
      records.clear();
    }

    static async deleteOne(query: any) {
      if (query?.tokenHash) {
        for (const [k, v] of records.entries()) {
          if (v.tokenHash === query.tokenHash) records.delete(k);
        }
      }
      if (query?._id) {
        records.delete(String(query._id));
      }
      return { deletedCount: 1 };
    }

    static async findOne(query: any) {
      const tokenHash = query?.tokenHash;
      if (!tokenHash) return null;
      for (const r of records.values()) {
        if (r.tokenHash === tokenHash) {
          const doc = new InMemoryRefreshToken(r);
          return {
            ...doc,
            populate: async () => ({ ...doc, user: { _id: doc.user } }),
          } as any;
        }
      }
      return null;
    }

    async save() {
      records.set(this._id, {
        _id: this._id,
        tokenHash: this.tokenHash,
        user: this.user,
        expiresAt: this.expiresAt,
      });
      return this;
    }
  }

  RefreshTokenModel = InMemoryRefreshToken as any;
} else {

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, index: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RefreshTokenModel = mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
}

export default RefreshTokenModel;
