import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const adminEmail = 'singh@gmail.com';
    const adminPassword = 'anshu1234';
    const adminName = 'Admin';
    const adminUsername = 'admin';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('Admin user already exists');
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    const admin = new User({
      username: adminUsername,
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      isAdmin: true,
      location: {
        type: 'Point',
        coordinates: [0, 0], // Default location
      },
      isOnline: false,
      following: [],
      followers: [],
    });

    await admin.save();
    console.log(`Admin user created successfully`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
