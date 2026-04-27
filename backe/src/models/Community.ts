import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunity extends Document {
  name: string;
  purpose?: string;
  profilePicture?: string;
  createdBy: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
}

const CommunitySchema = new Schema<ICommunity>(
  {
    name: { type: String, required: true, unique: true, index: true, trim: true },
    purpose: { type: String, trim: true, maxlength: 240 },
    profilePicture: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export default mongoose.model<ICommunity>('Community', CommunitySchema);
