import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { uploadsDir } from '../utils/paths.js';
import { validateUploadedFile } from '../utils/fileValidation.js';

const router = Router();

const extensionFromMime = (mimetype: string): string => {
  const m = (mimetype || '').toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  if (map[m]) return map[m];
  const parts = m.split('/');
  const subtype = parts[1] || '';
  const safe = subtype.replace(/[^a-z0-9]+/g, '');
  return safe ? `.${safe}` : '';
};

const getUploadExtension = (originalname: string, mimetype: string): string => {
  const ext = path.extname(originalname || '').toLowerCase();
  const validExtensionsForMime: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
  };

  const mimeType = (mimetype || '').toLowerCase();
  const validExts = validExtensionsForMime[mimeType];

  // If extension matches MIME type, use it
  if (ext && validExts && validExts.includes(ext)) {
    return ext;
  }

  // Otherwise, infer from MIME type
  const inferred = extensionFromMime(mimetype);
  if (inferred) return inferred;

  // If no mime match and no original extension, use generic extension
  if (ext) return ext;
  
  // Last resort: generate an extension based on file type
  if (mimeType.startsWith('image/')) return '.jpg';
  if (mimeType.startsWith('video/')) return '.mp4';
  
  return '';
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
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = getUploadExtension(file.originalname, file.mimetype);
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const mt = (file.mimetype || '').toLowerCase();
    // HEIC/HEIF are common on iOS but not reliably viewable on the web without conversion.
    // Reject early with a clear message to avoid "corrupted image" reports in the UI.
    if (mt === 'image/heic' || mt === 'image/heif') {
      cb(new Error('HEIC/HEIF images are not supported. Please upload JPG/PNG/WebP instead.'));
      return;
    }

    // Allow images and videos
    if (mt.startsWith('image/') || mt.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Upload endpoint for files
router.post(
  '/',
  requireAuth,
  (req, res, next) => {
    upload.single('file')(req as any, res as any, (err: any) => {
      if (err) {
        console.error('[upload] Multer error:', err.message);
        return res.status(400).json({ message: err.message || 'Upload failed' });
      }
      next();
    });
  },
  (req, res) => {
  try {
    if (!req.file) {
      console.log('[upload] No file provided in request');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Log upload details for debugging
    console.log('[upload] File received:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    // Validate file signature to ensure it's not corrupted
    if (!validateUploadedFile(req.file.path, req.file.mimetype)) {
      console.error('[upload] File validation failed for:', {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      try {
        fs.unlinkSync(req.file.path); // best-effort cleanup
      } catch (e) {
        console.warn('[upload] Failed to delete invalid upload:', req.file.path, e);
      }
      return res.status(400).json({ 
        message: `File validation failed: ${req.file.mimetype} file appears to be corrupted or invalid. Please try a different file or convert to JPG/PNG/WebP format.` 
      });
    }

    // Generate file hash for integrity verification
    const fileHash = generateFileHash(req.file.path);

    // Respect proxy headers when constructing absolute URLs
    const protocol = (req.get('x-forwarded-proto') as string) || req.protocol || 'http';
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    console.log('[upload] File validated and stored successfully:', {
      filename: req.file.filename,
      hash: fileHash,
      url: fileUrl
    });

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
    console.error('[upload] Server error:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

export default router;
