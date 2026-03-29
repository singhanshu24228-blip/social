import mongoose, { Schema } from 'mongoose';
import User from './User.js';

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let GroupMessageModel: any;

if (useInMemory) {
  type GroupMessageRecord = {
    _id: string;
    groupId: string;
    senderId: string;
    message?: string;
    e2ee?: any;
    mediaUrl?: string;
    mediaType?: string;
    voiceUrl?: string;
    voiceGender?: string;
    status: string;
    createdAt: string;
  };

  const messages = new Map<string, GroupMessageRecord>();
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const matches = (value: any, query: any): boolean => {
    if (!query || Object.keys(query).length === 0) return true;
    for (const [key, expected] of Object.entries(query)) {
      if (String(value?.[key]) !== String(expected)) return false;
    }
    return true;
  };

  const makeQuery = (resolver: () => any[]) => {
    let sortField: string | null = null;
    let sortDir = 1;
    let populateField: string | null = null;
    let leanMode = false;

    const query: any = {
      sort(spec: any) {
        const entry = Object.entries(spec || {})[0];
        if (entry) {
          sortField = entry[0];
          sortDir = Number(entry[1]) >= 0 ? 1 : -1;
        }
        return query;
      },
      allowDiskUse() {
        return query;
      },
      populate(field: string) {
        populateField = field;
        return query;
      },
      lean() {
        leanMode = true;
        return query;
      },
      then(resolve: any, reject: any) {
        return Promise.resolve().then(async () => {
          let rows = resolver().map((row) => clone(row));
          if (sortField) {
            rows = rows.sort((a, b) => String(a?.[sortField!] || '').localeCompare(String(b?.[sortField!] || '')) * sortDir);
          }
          if (populateField === 'senderId') {
            rows = await Promise.all(rows.map(async (row) => {
              const sender = row.senderId ? await User.findById(row.senderId) : null;
              return sender ? { ...row, senderId: sender } : row;
            }));
          }
          return leanMode ? rows : rows;
        }).then(resolve, reject);
      },
      catch(reject: any) {
        return Promise.resolve().then(() => resolver()).catch(reject);
      },
    };

    return query;
  };

  class InMemoryGroupMessage {
    _id: string;
    groupId: string;
    senderId: string;
    message?: string;
    e2ee?: any;
    mediaUrl?: string;
    mediaType?: string;
    voiceUrl?: string;
    voiceGender?: string;
    status: string;
    createdAt: string;

    constructor(data: any) {
      this._id = String(data?._id || new mongoose.Types.ObjectId().toHexString());
      this.groupId = String(data?.groupId || '');
      this.senderId = String(data?.senderId || '');
      this.message = data?.message;
      this.e2ee = data?.e2ee ? clone(data.e2ee) : undefined;
      this.mediaUrl = data?.mediaUrl;
      this.mediaType = data?.mediaType;
      this.voiceUrl = data?.voiceUrl;
      this.voiceGender = data?.voiceGender;
      this.status = String(data?.status || 'sent');
      this.createdAt = data?.createdAt || new Date().toISOString();
    }

    async save() {
      messages.set(this._id, clone({
        _id: this._id,
        groupId: this.groupId,
        senderId: this.senderId,
        message: this.message,
        e2ee: this.e2ee,
        mediaUrl: this.mediaUrl,
        mediaType: this.mediaType,
        voiceUrl: this.voiceUrl,
        voiceGender: this.voiceGender,
        status: this.status,
        createdAt: this.createdAt,
      }));
      return this;
    }

    static __resetForTests() {
      messages.clear();
    }

    static __allForTests() {
      return Array.from(messages.values()).map((m) => clone(m));
    }

    static find(query: any = {}) {
      return makeQuery(() =>
        Array.from(messages.values()).filter((message) => matches(message, query))
      );
    }

    static async deleteMany(query: any = {}) {
      let deletedCount = 0;
      for (const [id, value] of messages.entries()) {
        if (!matches(value, query)) continue;
        messages.delete(id);
        deletedCount++;
      }
      return { deletedCount };
    }
  }

  GroupMessageModel = InMemoryGroupMessage as any;
} else {
  const GroupMessageSchema = new Schema(
    {
      groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
      senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      message: { type: String },
      e2ee: {
        v: { type: Number },
        alg: { type: String },
        nonce: { type: String },
        ciphertext: { type: String },
        senderKeyId: { type: String },
        recipients: [
          {
            userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            receiverKeyId: { type: String },
            nonce: { type: String },
            wrappedKey: { type: String },
          },
        ],
      },
      mediaUrl: { type: String },
      mediaType: { type: String },
      voiceUrl: { type: String },
      voiceGender: { type: String, enum: ['male', 'female'] },
      status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
    },
    { timestamps: true }
  );

  GroupMessageModel = mongoose.model('GroupMessage', GroupMessageSchema);
}

export default GroupMessageModel;
