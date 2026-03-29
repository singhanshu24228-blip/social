import mongoose, { Schema } from 'mongoose';
import User from './User.js';

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let PrivateMessageModel: any;

if (useInMemory) {
  type MessageRecord = {
    _id: string;
    senderId: string;
    receiverId: string;
    message?: string;
    e2ee?: any;
    mediaUrl?: string;
    mediaType?: string;
    voiceUrl?: string;
    voiceGender?: string | null;
    status: string;
    reactions: any[];
    isDeleted: boolean;
    editedAt?: Date;
    createdAt: string;
  };

  const messages = new Map<string, MessageRecord>();
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const matches = (value: any, query: any): boolean => {
    if (!query || Object.keys(query).length === 0) return true;
    for (const [key, expected] of Object.entries(query)) {
      if (key === '$or' && Array.isArray(expected)) {
        if (!(expected as any[]).some((branch) => matches(value, branch))) return false;
        continue;
      }
      if (String(value?.[key]) !== String(expected)) return false;
    }
    return true;
  };

  const makeQuery = (resolver: () => any[]) => {
    let sortField: string | null = null;
    let sortDir = 1;
    let populateFields: string[] = [];
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
      populate(field: string) {
        populateFields.push(field);
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
            rows = rows.sort((a, b) => {
              const left = String(a?.[sortField!] || '');
              const right = String(b?.[sortField!] || '');
              return left.localeCompare(right) * sortDir;
            });
          }
          for (const field of populateFields) {
            if (field === 'senderId' || field === 'receiverId') {
              rows = await Promise.all(rows.map(async (row) => {
                const userId = row[field];
                const user = userId ? await User.findById(userId) : null;
                return user ? { ...row, [field]: user } : row;
              }));
            }
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

  class InMemoryPrivateMessage {
    _id: string;
    senderId: string;
    receiverId: string;
    message?: string;
    e2ee?: any;
    mediaUrl?: string;
    mediaType?: string;
    voiceUrl?: string;
    voiceGender?: string | null;
    status: string;
    reactions: any[];
    isDeleted: boolean;
    editedAt?: Date;
    createdAt: string;

    constructor(data: any) {
      this._id = String(data?._id || new mongoose.Types.ObjectId().toHexString());
      this.senderId = String(data?.senderId || '');
      this.receiverId = String(data?.receiverId || '');
      this.message = data?.message;
      this.e2ee = data?.e2ee ? clone(data.e2ee) : undefined;
      this.mediaUrl = data?.mediaUrl;
      this.mediaType = data?.mediaType;
      this.voiceUrl = data?.voiceUrl;
      this.voiceGender = data?.voiceGender ?? null;
      this.status = String(data?.status || 'sent');
      this.reactions = clone(data?.reactions || []);
      this.isDeleted = Boolean(data?.isDeleted || false);
      this.editedAt = data?.editedAt;
      this.createdAt = data?.createdAt || new Date().toISOString();
    }

    async save() {
      messages.set(this._id, clone({
        _id: this._id,
        senderId: this.senderId,
        receiverId: this.receiverId,
        message: this.message,
        e2ee: this.e2ee,
        mediaUrl: this.mediaUrl,
        mediaType: this.mediaType,
        voiceUrl: this.voiceUrl,
        voiceGender: this.voiceGender,
        status: this.status,
        reactions: this.reactions,
        isDeleted: this.isDeleted,
        editedAt: this.editedAt,
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

    static async findById(id: any) {
      const found = messages.get(String(id));
      return found ? new InMemoryPrivateMessage(found) : null;
    }

    static async aggregate() {
      return [];
    }
  }

  PrivateMessageModel = InMemoryPrivateMessage as any;
} else {
  const PrivateMessageSchema = new Schema(
    {
      senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      message: { type: String },
      e2ee: {
        v: { type: Number },
        alg: { type: String },
        nonce: { type: String },
        ciphertext: { type: String },
        senderKeyId: { type: String },
        receiverKeyId: { type: String },
      },
      mediaUrl: { type: String },
      mediaType: { type: String },
      voiceUrl: { type: String },
      voiceGender: { type: String, enum: ['male', 'female', null], default: null },
      status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
      reactions: [
        {
          emoji: String,
          userId: { type: Schema.Types.ObjectId, ref: 'User' },
        }
      ],
      isDeleted: { type: Boolean, default: false },
      editedAt: { type: Date },
    },
    { timestamps: true }
  );

  PrivateMessageModel = mongoose.model('PrivateMessage', PrivateMessageSchema);
}

export default PrivateMessageModel;
