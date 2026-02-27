import mongoose, { Schema } from 'mongoose';

const PrivateMessageSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String },
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

export default mongoose.model('PrivateMessage', PrivateMessageSchema);
