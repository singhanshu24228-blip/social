import mongoose, { Document, Schema } from 'mongoose';

export interface IWithdrawalRequest extends Document {
  userId: mongoose.Types.ObjectId;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  upiId?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    upiId: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IWithdrawalRequest>(
  'WithdrawalRequest',
  WithdrawalRequestSchema
);
