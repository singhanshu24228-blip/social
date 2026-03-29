import mongoose, { Schema } from 'mongoose';

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let NotificationModel: any;

if (useInMemory) {
  type NotificationRecord = {
    _id: string;
    userId: string;
    fromUser?: string;
    type: string;
    postId?: string;
    commentId?: string;
    messageId?: string;
    content?: string;
    isRead: boolean;
    readAt?: Date;
    createdAt: Date;
  };

  const notifications = new Map<string, NotificationRecord>();
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const matches = (value: any, query: any): boolean => {
    if (!query || Object.keys(query).length === 0) return true;
    for (const [key, expected] of Object.entries(query)) {
      if (String(value?.[key]) !== String(expected)) return false;
    }
    return true;
  };

  class InMemoryNotification {
    _id: string;
    userId: string;
    fromUser?: string;
    type: string;
    postId?: string;
    commentId?: string;
    messageId?: string;
    content?: string;
    isRead: boolean;
    readAt?: Date;
    createdAt: Date;

    constructor(data: any) {
      this._id = String(data?._id || new mongoose.Types.ObjectId().toHexString());
      this.userId = String(data?.userId || '');
      this.fromUser = data?.fromUser ? String(data.fromUser) : undefined;
      this.type = String(data?.type || '');
      this.postId = data?.postId;
      this.commentId = data?.commentId;
      this.messageId = data?.messageId;
      this.content = data?.content;
      this.isRead = Boolean(data?.isRead || false);
      this.readAt = data?.readAt;
      this.createdAt = data?.createdAt || new Date();
    }

    async save() {
      notifications.set(this._id, clone(this));
      return this;
    }

    async populate() {
      return this;
    }

    static __resetForTests() {
      notifications.clear();
    }

    static countDocuments(query: any = {}) {
      return Promise.resolve(Array.from(notifications.values()).filter((n) => matches(n, query)).length);
    }

    static deleteMany(query: any = {}) {
      let deletedCount = 0;
      for (const [id, value] of notifications.entries()) {
        if (matches(value, query)) {
          notifications.delete(id);
          deletedCount++;
        }
      }
      return Promise.resolve({ deletedCount });
    }

    static updateMany(query: any = {}, update: any = {}) {
      let modifiedCount = 0;
      for (const [id, value] of notifications.entries()) {
        if (!matches(value, query)) continue;
        notifications.set(id, { ...value, ...update });
        modifiedCount++;
      }
      return Promise.resolve({ modifiedCount });
    }

    static findByIdAndUpdate(id: any, update: any = {}) {
      const value = notifications.get(String(id));
      if (!value) return Promise.resolve(null);
      const next = { ...value, ...update };
      notifications.set(String(id), next);
      return Promise.resolve(new InMemoryNotification(next));
    }

    static findByIdAndDelete(id: any) {
      const value = notifications.get(String(id));
      if (!value) return Promise.resolve(null);
      notifications.delete(String(id));
      return Promise.resolve(new InMemoryNotification(value));
    }

    static find(query: any = {}) {
      let limitValue = Infinity;
      let skipValue = 0;
      let sortField: string | null = null;
      let sortDir = 1;
      const queryObj: any = {
        populate() {
          return queryObj;
        },
        sort(spec: any) {
          const entry = Object.entries(spec || {})[0];
          if (entry) {
            sortField = entry[0];
            sortDir = Number(entry[1]) >= 0 ? 1 : -1;
          }
          return queryObj;
        },
        allowDiskUse() {
          return queryObj;
        },
        limit(n: number) {
          limitValue = n;
          return queryObj;
        },
        skip(n: number) {
          skipValue = n;
          return queryObj;
        },
        lean() {
          let rows = Array.from(notifications.values()).filter((n) => matches(n, query));
          if (sortField) {
            rows = rows.sort((a, b) => String((a as any)?.[sortField!] || '').localeCompare(String((b as any)?.[sortField!] || '')) * sortDir);
          }
          rows = rows.slice(skipValue, skipValue + limitValue);
          return Promise.resolve(rows.map((row) => clone(row)));
        },
      };
      return queryObj;
    }
  }

  NotificationModel = InMemoryNotification as any;
} else {
  const NotificationSchema = new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      fromUser: { type: Schema.Types.ObjectId, ref: 'User' },
      type: {
        type: String,
        enum: ['like', 'comment', 'follow', 'message', 'reaction', 'mention', 'post'],
        required: true,
      },
      postId: { type: Schema.Types.ObjectId, ref: 'Post' },
      commentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
      messageId: { type: Schema.Types.ObjectId, ref: 'PrivateMessage' },
      content: String,
      isRead: { type: Boolean, default: false },
      readAt: Date,
    },
    { timestamps: true }
  );

  NotificationModel = mongoose.model('Notification', NotificationSchema);
}

export default NotificationModel;
