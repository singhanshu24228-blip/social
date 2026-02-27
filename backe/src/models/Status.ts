import mongoose, { Schema } from 'mongoose';

const StatusSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String },
    mediaUrl: { type: String },
    songUrl: { type: String },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    views: { type: Number, default: 0 },
    viewers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);
StatusSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Status', StatusSchema);
