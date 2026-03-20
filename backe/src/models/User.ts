import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  username: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  profilePicture?: string;
  about?: string;
  totalEarnings?: number;
  withdrawnTotal?: number;
  isAdmin?: boolean;
  // track failed login attempts & temporary lockouts
  failedLoginAttempts?: number;
  lockUntil?: Date;
  // fields used when user requests a password reset via OTP
  passwordReset?: {
    otpHash: string;
    expires: Date;
  };
  // OTP for account deletion requests (sent to email)
  accountDeletion?: {
    otpHash: string;
    expires: Date;
  };
  // store pending username change requests
  usernameChange?: {
    newUsername: string;
    otpHash: string;
    expires: Date;
  };
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  isOnline: boolean;
  isInNightMode?: boolean;
  nightModeEnteredAt?: Date;
  lastNightModeExit?: Date;
  following: mongoose.Types.ObjectId[];
  followers: mongoose.Types.ObjectId[];
  blockedUsers?: mongoose.Types.ObjectId[];
  comparePassword(candidate: string): Promise<boolean>;
}

const useInMemory =
  process.env.NODE_ENV === 'test' && process.env.IN_MEMORY_DB?.trim() === 'true';

let UserModel: any;

if (useInMemory) {
  type UserRecord = {
    _id: string;
    username: string;
    name: string;
    email: string;
    phone?: string;
    password: string;
    profilePicture?: string;
    about?: string;
    totalEarnings?: number;
    withdrawnTotal?: number;
    // track failed login attempts & lockout
    failedLoginAttempts?: number;
    lockUntil?: Date;
    // OTP-related fields
    passwordReset?: { otpHash: string; expires: Date };
    accountDeletion?: { otpHash: string; expires: Date };
    usernameChange?: { newUsername: string; otpHash: string; expires: Date };
    location: { type: 'Point'; coordinates: [number, number] };
    isOnline: boolean;
    isInNightMode?: boolean;
    nightModeEnteredAt?: Date;
    lastNightModeExit?: Date;
    following: string[];
    followers: string[];
    blockedUsers: string[];
  };

  const users = new Map<string, UserRecord>();

  class InMemoryUser {
    _id: string;
    username: string;
    name: string;
    email: string;
    phone?: string;
    password: string;
    profilePicture?: string;
    about?: string;
    totalEarnings?: number;
    withdrawnTotal?: number;
    failedLoginAttempts?: number;
    lockUntil?: Date;
    passwordReset?: { otpHash: string; expires: Date };
    accountDeletion?: { otpHash: string; expires: Date };
    usernameChange?: { newUsername: string; otpHash: string; expires: Date };
    location: { type: 'Point'; coordinates: [number, number] };
    isOnline: boolean;
    isInNightMode?: boolean;
    nightModeEnteredAt?: Date;
    lastNightModeExit?: Date;
    following: string[];
    followers: string[];
    blockedUsers: string[];

    constructor(data: any) {
      this._id = data?._id || new mongoose.Types.ObjectId().toHexString();
      this.username = data.username;
      this.name = data.name;
      this.email = data.email;
      this.phone = data.phone;
      this.password = data.password;
      this.profilePicture = data.profilePicture;
      this.about = data.about;
      this.totalEarnings = Number(data.totalEarnings || 0);
      this.withdrawnTotal = Number(data.withdrawnTotal || 0);
      this.failedLoginAttempts = data.failedLoginAttempts || 0;
      this.lockUntil = data.lockUntil;
      this.passwordReset = data.passwordReset;
      this.accountDeletion = data.accountDeletion;
      this.usernameChange = data.usernameChange;
      this.location = data.location;
      this.isOnline = Boolean(data.isOnline);
      this.isInNightMode = data.isInNightMode;
      this.nightModeEnteredAt = data.nightModeEnteredAt;
      this.lastNightModeExit = data.lastNightModeExit;
      this.following = data.following || [];
      this.followers = data.followers || [];
      this.blockedUsers = data.blockedUsers || [];
    }

    static __resetForTests() {
      users.clear();
    }

    static async findOne(query: any) {
      if (query?.email) {
        for (const u of users.values()) {
          if (u.email === query.email) return new InMemoryUser(u);
        }
        return null;
      }
      return null;
    }

    static findById(id: string) {
      const u = users.get(String(id));
      if (!u) return null;
      const doc = new InMemoryUser(u);
      return Promise.resolve(doc);
    }

    static async findByIdAndUpdate(id: string, update: any) {
      const u = users.get(String(id));
      if (!u) return null;
      const next = { ...u, ...update };
      users.set(String(id), next);
      return new InMemoryUser(next);
    }

    static async updateOne(query: any, update: any) {
      // Find user by query (typically { _id: userId })
      let userId = query._id;
      if (typeof userId === 'object' && userId.toString) {
        userId = userId.toString();
      }
      
      const u = users.get(String(userId));
      if (!u) return null;
      
      // Apply update to the user data
      const updatedData = { ...u, ...update };
      
      // Store the updated data directly (don't call save() to avoid password re-hashing)
      users.set(String(userId), updatedData);
      
      return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
    }

    static async deleteOne(query: any) {
      let userId = query._id;
      if (typeof userId === 'object' && userId.toString) {
        userId = userId.toString();
      }
      
      const deleted = users.delete(String(userId));
      return { deletedCount: deleted ? 1 : 0 };
    }

    static async isUsernameAvailable(
      _username: string,
      _coordinates: [number, number],
      _radiusMeters = 2000,
      _excludeUserId?: string | mongoose.Types.ObjectId
    ) {
      return true;
    }

    async save() {
      const hashed =
        this.password && this.password.startsWith('$2')
          ? this.password
          : await bcrypt.hash(this.password, 4);
      const rec: UserRecord = {
        _id: this._id,
        username: this.username,
        name: this.name,
        email: this.email,
        phone: this.phone,
        password: hashed,
        profilePicture: this.profilePicture,
        about: this.about,
        totalEarnings: Number(this.totalEarnings || 0),
        withdrawnTotal: Number(this.withdrawnTotal || 0),
        // include new fields in memory version
        failedLoginAttempts: this.failedLoginAttempts || 0,
        lockUntil: this.lockUntil,
        passwordReset: this.passwordReset,
        accountDeletion: this.accountDeletion,
        usernameChange: this.usernameChange,
        location: this.location,
        isOnline: this.isOnline,
        isInNightMode: this.isInNightMode,
        nightModeEnteredAt: this.nightModeEnteredAt,
        lastNightModeExit: this.lastNightModeExit,
        following: this.following,
        followers: this.followers,
        blockedUsers: this.blockedUsers,
      };
      users.set(this._id, rec);
      this.password = hashed;
      return this;
    }

    async comparePassword(candidate: string) {
      return bcrypt.compare(candidate, this.password);
    }
  }

  UserModel = InMemoryUser as any;
} else {

  const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String },
    password: { type: String, required: true },
    profilePicture: { type: String },
    about: { type: String, default: '', maxlength: 280 },
    totalEarnings: { type: Number, default: 0, min: 0 },
    withdrawnTotal: { type: Number, default: 0, min: 0 },
    // login lockout info
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    // password reset OTP storage (hashed)
    passwordReset: {
      otpHash: String,
      expires: Date,
    },
    // store OTP when user asks to delete their account
    accountDeletion: {
      otpHash: String,
      expires: Date,
    },
    usernameChange: {
      newUsername: String,
      otpHash: String,
      expires: Date,
    },
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
    isInNightMode: { type: Boolean, default: false },
    nightModeEnteredAt: { type: Date },
    lastNightModeExit: { type: Date },
    following: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    followers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
    isAdmin: { type: Boolean, default: false },
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
  excludeUserId?: string | mongoose.Types.ObjectId
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
    const excludeId =
      typeof excludeUserId === 'string' && mongoose.isValidObjectId(excludeUserId)
        ? new mongoose.Types.ObjectId(excludeUserId)
        : excludeUserId;
    query._id = { $ne: excludeId };
  }
  const res = await this.findOne(query).lean();
  return !res;
};

UserModel = mongoose.model<IUser>('User', UserSchema);
}

export default UserModel;
