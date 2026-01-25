import mongoose, { Document, Schema } from 'mongoose';

export interface IGroup extends Document {
  groupName: string;
  areaCode: string;
  pincode: string;
  distanceRange: '1KM' | '2KM';
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  members: mongoose.Types.ObjectId[];
}

const GroupSchema = new Schema<IGroup>(
  {
    groupName: { type: String, required: true, unique: true, index: true },
    areaCode: { type: String, required: true },
    pincode: { type: String, required: true },
    distanceRange: { type: String, enum: ['1KM', '2KM'], required: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: { type: [Number], required: true },
    },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

GroupSchema.index({ location: '2dsphere' });

export default mongoose.model<IGroup>('Group', GroupSchema);
