import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { uploadsDir } from '../utils/paths.js';

const router = Router();

const findUploadPath = (filename: string) => {
  return path.join(uploadsDir, filename);
};

// Return filesystem info for an upload filename
router.get('/uploads/info/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = findUploadPath(filename);
  try {
    const stat = fs.statSync(filePath);
    res.json({ exists: true, size: stat.size, mtime: stat.mtime, path: `/uploads/${filename}` });
  } catch (e) {
    res.status(404).json({ exists: false, message: 'File not found' });
  }
});

// Serve the file with no-cache headers for debugging
router.get('/uploads/serve/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = findUploadPath(filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(filePath);
});

export default router;
