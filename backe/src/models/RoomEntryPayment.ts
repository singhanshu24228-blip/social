import mongoose, { Document, Schema } from 'mongoose';

export interface IRoomEntryPayment extends Document {
  roomId: mongoose.Types.ObjectId;
  payeeUserId: mongoose.Types.ObjectId; // room creator
  payerUserId: mongoose.Types.ObjectId; // entrant
  orderId: string;
  paymentId: string;
  amount: number; // INR
  createdAt: Date;
  updatedAt: Date;
}

const RoomEntryPaymentSchema = new Schema<IRoomEntryPayment>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    payeeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    payerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IRoomEntryPayment>('RoomEntryPayment', RoomEntryPaymentSchema);

