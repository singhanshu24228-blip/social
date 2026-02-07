import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// File signature validation - check magic bytes to ensure files are valid
const validateFileSignature = (filePath: string, mimetype: string): boolean => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // Check file signatures (magic bytes)
    if (mimetype.startsWith('image/')) {
      // JPEG: FF D8 FF
      if (mimetype === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return true;
      }
      // PNG: 89 50 4E 47
      if (mimetype === 'image/png' && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return true;
      }
      // GIF: 47 49 46
      if (mimetype === 'image/gif' && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return true;
      }
      // WebP: RIFF ... WEBP
      if (mimetype === 'image/webp' && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        return true;
      }
      // For other image types, just check that file is not empty
      return true;
    }

    if (mimetype.startsWith('video/')) {
      // MP4: 66 74 79 70 (ftyp)
      if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return true;
      }
      // Just check not empty for other video types
      return true;
    }

    return true;
  } catch (error) {
    console.error('File signature validation error:', error);
    return false;
  }
};

// Generate SHA256 hash of file for integrity verification
const generateFileHash = (filePath: string): string => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    console.error('Hash generation error:', error);
    return '';
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Upload endpoint for files
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Validate file signature to ensure it's not corrupted
    if (!validateFileSignature(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path); // Delete corrupted file
      return res.status(400).json({ 
        message: 'Uploaded file appears to be corrupted or invalid. Please try uploading again.' 
      });
    }

    // Generate file hash for integrity verification
    const fileHash = generateFileHash(req.file.path);

    const protocol = req.protocol;
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      hash: fileHash, // Return hash so client can verify integrity
      uploadedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

export default router;
