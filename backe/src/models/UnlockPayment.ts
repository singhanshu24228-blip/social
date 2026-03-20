import mongoose, { Document, Schema } from 'mongoose';

export interface IUnlockPayment extends Document {
  postId: mongoose.Types.ObjectId;
  payeeUserId: mongoose.Types.ObjectId;
  payerUserId: mongoose.Types.ObjectId;
  orderId: string;
  paymentId: string;
  amount: number; // INR
  createdAt: Date;
  updatedAt: Date;
}

const UnlockPaymentSchema = new Schema<IUnlockPayment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    payeeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    payerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IUnlockPayment>('UnlockPayment', UnlockPaymentSchema);

