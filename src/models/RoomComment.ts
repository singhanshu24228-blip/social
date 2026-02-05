import mongoose, { Document, Schema } from 'mongoose';

export interface IRoomComment extends Document {
  room: any;
  author: any;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  createdAt: Date;
  expiresAt?: Date;
}

const RoomCommentSchema = new Schema<IRoomComment>(
  {
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String },
    mediaUrl: { type: String },
    mediaType: { type: String },
    expiresAt: { type: Date, required: false },
  },
  { timestamps: true }
);

// Use an expiresAt date for ephemeral comments. Documents with no expiresAt won't be auto-deleted.
// MongoDB TTL index will remove documents once expiresAt is reached (expireAfterSeconds: 0 uses the field directly).
RoomCommentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRoomComment>('RoomComment', RoomCommentSchema);
