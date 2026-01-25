import mongoose, { Schema } from 'mongoose';

const PrivateMessageSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String },
    mediaUrl: { type: String },
    mediaType: { type: String },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  },
  { timestamps: true }
);

export default mongoose.model('PrivateMessage', PrivateMessageSchema);
