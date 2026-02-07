import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

// Return filesystem info for an upload filename
router.get('/uploads/info/:filename', (req, res) => {
  const filename = req.params.filename;
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  const filePath = path.join(uploadsDir, filename);
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
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(filePath);
});

export default router;
