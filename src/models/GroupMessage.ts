import mongoose, { Schema } from 'mongoose';

const GroupMessageSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String },
    mediaUrl: { type: String },
    mediaType: { type: String },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  },
  { timestamps: true }
);

export default mongoose.model('GroupMessage', GroupMessageSchema);
