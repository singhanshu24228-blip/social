import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  username: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  isOnline: boolean;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String },
    password: { type: String, required: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: { type: [Number], required: true },
    },
    isOnline: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Create 2dsphere index for geospatial queries
UserSchema.index({ location: '2dsphere' });

UserSchema.pre<IUser>('save', async function (next) {
  const user = this;
  if (!user.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(user.password, salt);
  user.password = hash;
  next();
});

UserSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

// Static helper to check username availability within radius (in meters)
// Optionally exclude a user ID (useful when checking availability for the same user)
UserSchema.statics.isUsernameAvailable = async function (
  username: string,
  coordinates: [number, number],
  radiusMeters = 2000,
  excludeUserId?: string
) {
  const query: any = {
    username,
    location: {
      $nearSphere: {
        $geometry: { type: 'Point', coordinates },
        $maxDistance: radiusMeters,
      },
    },
  };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }
  const res = await this.findOne(query).lean();
  return !res;
};

export default mongoose.model<IUser>('User', UserSchema);
