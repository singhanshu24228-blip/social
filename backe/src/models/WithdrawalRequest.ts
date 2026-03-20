import mongoose, { Document, Schema } from 'mongoose';

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface IWithdrawalRequest extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  totalMoney: number;
  amount: number;
  accountInfo: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    upiId?: string;
  };
  status: WithdrawalStatus;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true },
    totalMoney: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 1 },
    accountInfo: {
      accountHolderName: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      upiId: { type: String, default: '' },
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export default mongoose.model<IWithdrawalRequest>('WithdrawalRequest', WithdrawalRequestSchema);

