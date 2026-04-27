import mongoose, { Document, Schema } from 'mongoose';

export interface IPost extends Document {
  user: mongoose.Types.ObjectId;
  community?: mongoose.Types.ObjectId;
  username?: string;
  content: string;
  imageUrl?: string;
  songUrl?: string;
  anonymous?: boolean;
  isNightPost?: boolean;
  isPrivate?: boolean;
  isLocked?: boolean;
  lockedPrice?: number;
  unlockedBy?: mongoose.Types.ObjectId[];
  likes: mongoose.Types.ObjectId[];
  reactions?: Map<string, number>;
  userReactions?: Map<string, string>;
  expiresAt?: Date;
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
    community: { type: Schema.Types.ObjectId, ref: 'Community', index: true },
    username: { type: String },
    content: { type: String, default: '' },
    imageUrl: { type: String },
    songUrl: { type: String },
    anonymous: { type: Boolean, default: false },
    isNightPost: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    lockedPrice: { type: Number, default: 0 },
    unlockedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reactions: { type: Map, of: Number, default: new Map() },
    userReactions: { type: Map, of: String, default: new Map() },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
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

PostSchema.pre('validate', function (next) {
  const content = String((this as any).content || '').trim();
  const imageUrl = String((this as any).imageUrl || '').trim();
  const songUrl = String((this as any).songUrl || '').trim();

  if (!content && !imageUrl && !songUrl) {
    (this as any).invalidate('content', 'Post must have text, an image/video, or a song.');
  }
  next();
});

export default mongoose.model<IPost>('Post', PostSchema);
