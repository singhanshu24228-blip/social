import mongoose, { Document, Schema } from 'mongoose';

export interface IRoom extends Document {
  name: string;
  creator: any;
  participants: any[];
  isNightRoom: boolean;
  entryFee: number; // INR; 0 means free
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isNightRoom: { type: Boolean, default: true },
    entryFee: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IRoom>('Room', RoomSchema);
