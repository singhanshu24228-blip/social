import mongoose, { Document, Schema } from 'mongoose';

export interface IPost extends Document {
  user: mongoose.Types.ObjectId;
  username?: string;
  content: string;
  imageUrl?: string;
  songUrl?: string;
  anonymous?: boolean;
  isNightPost?: boolean;
  likes: mongoose.Types.ObjectId[];
  reactions?: Map<string, number>;
  userReactions?: Map<string, string>;
  comments: {
    user: mongoose.Types.ObjectId;
    content: string;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String },
    content: { type: String, required: true },
    imageUrl: { type: String },
    songUrl: { type: String },
    anonymous: { type: Boolean, default: false },
    isNightPost: { type: Boolean, default: false },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reactions: { type: Map, of: Number, default: new Map() },
    userReactions: { type: Map, of: String, default: new Map() },
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IPost>('Post', PostSchema);
