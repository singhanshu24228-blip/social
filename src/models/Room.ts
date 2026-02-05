import mongoose, { Document, Schema } from 'mongoose';

export interface IRoom extends Document {
  name: string;
  creator: any;
  participants: any[];
  pendingRequests: any[];
  isNightRoom: boolean;
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    pendingRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isNightRoom: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IRoom>('Room', RoomSchema);
