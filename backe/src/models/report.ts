import mongoose, { Document, Schema } from 'mongoose';

export interface IReport extends Document {
  reporterId: mongoose.Types.ObjectId;
  targetType: 'post' | 'user';
  postId?: mongoose.Types.ObjectId;
  reportedUserId?: mongoose.Types.ObjectId;
  reportedUsername?: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'rejected';
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>({
  reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  targetType: { type: String, enum: ["post", "user"], required: true },
  postId: { type: Schema.Types.ObjectId, ref: "Post" },
  reportedUserId: { type: Schema.Types.ObjectId, ref: "User" },
  reportedUsername: { type: String },
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },

  status: {
    type: String,
    enum: ["pending", "reviewed", "rejected"],
    default: "pending"
  }
});

// Uniqueness: a user can report a post once, and can report another user once.
ReportSchema.index(
  { reporterId: 1, targetType: 1, postId: 1 },
  { unique: true, partialFilterExpression: { targetType: "post", postId: { $exists: true } } }
);
ReportSchema.index(
  { reporterId: 1, targetType: 1, reportedUserId: 1 },
  { unique: true, partialFilterExpression: { targetType: "user" } }
);

export default mongoose.model<IReport>('Report', ReportSchema);
