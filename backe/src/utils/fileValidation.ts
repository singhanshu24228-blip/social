import fs from 'fs';

const readAt = (filePath: string, offset: number, length: number) => {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(length);
      const bytesRead = fs.readSync(fd, buf, 0, length, offset);
      return buf.subarray(0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    console.error('[fileValidation] Error reading file at offset', offset + ':', error);
    return Buffer.alloc(0);
  }
};

export const validateUploadedFile = (filePath: string, mimetype: string): boolean => {
  const mt = String(mimetype || '').toLowerCase();
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return false;
  }

  if (size <= 0) return false;

  // Minimum file size validation (avoid extremely small files that are likely incomplete).
  // Keep this permissive: very small but valid images (e.g. 1x1 PNG) can be < 100 bytes.
  const MIN_UNKNOWN_IMAGE_SIZE = 32;

  // Images
  if (mt === 'image/png') {
    // Require: signature (8) + length (4) + type (4) = 16 bytes minimum
    if (size < 16) return false;
    const head = readAt(filePath, 0, 24);
    if (head.length < 16) return false;
    const sigOk =
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a;
    if (!sigOk) return false;

    // First chunk must be IHDR (per spec) and has length 13
    const len = (head[8] << 24) | (head[9] << 16) | (head[10] << 8) | head[11];
    const isIHDR = head[12] === 0x49 && head[13] === 0x48 && head[14] === 0x44 && head[15] === 0x52;
    if (!isIHDR) return false;
    if (len !== 13) return false;
    
    // Check for PNG end marker (IEND chunk)
    const tail = readAt(filePath, Math.max(0, size - 12), 12);
    if (tail.length < 8) return false;
    // IEND chunk has zero length (4 bytes: 00 00 00 00) followed by type "IEND"
    const isIEND = tail[4] === 0x49 && tail[5] === 0x45 && tail[6] === 0x4e && tail[7] === 0x44;
    if (!isIEND) return false;
    
    return true;
  }

  if (mt === 'image/jpeg' || mt === 'image/jpg') {
    // JPEG files must be at least several hundred bytes for valid content
    if (size < 100) return false;
    
    const head = readAt(filePath, 0, 2);
    if (head.length < 2) return false;
    // SOI (Start of Image) marker
    if (!(head[0] === 0xff && head[1] === 0xd8)) return false;
    
    const tail = readAt(filePath, Math.max(0, size - 2), 2);
    if (tail.length < 2) return false;
    // EOI (End of Image) marker
    if (!(tail[0] === 0xff && tail[1] === 0xd9)) return false;
    
    // Additional check: look for SOF (Start of Frame) marker to ensure image has actual content
    // SOF markers are 0xFF followed by 0xC0-0xC3, 0xC5-0xC7, or 0xC9-0xCB
    let hasSofMarker = false;
    const sampleSize = Math.min(4096, size); // Check first 4KB
    const sample = readAt(filePath, 0, sampleSize);
    for (let i = 0; i < sample.length - 1; i++) {
      if (sample[i] === 0xff) {
        const marker = sample[i + 1];
        // SOF markers (baseline and progressive variants)
        if ((marker >= 0xc0 && marker <= 0xc3) || 
            (marker >= 0xc5 && marker <= 0xc7) || 
            (marker >= 0xc9 && marker <= 0xcb)) {
          hasSofMarker = true;
          break;
        }
      }
    }
    
    if (!hasSofMarker) {
      console.warn('[fileValidation] JPEG file rejected: no SOF marker found', filePath);
      return false;
    }
    
    return true;
  }

  if (mt === 'image/gif') {
    // "GIF87a" or "GIF89a" and ends with trailer 0x3B
    if (size < 20) return false;
    const head = readAt(filePath, 0, 6);
    if (head.length < 6) return false;
    const header = head.toString('ascii');
    if (header !== 'GIF87a' && header !== 'GIF89a') return false;
    const tail = readAt(filePath, size - 1, 1);
    if (tail.length < 1) return false;
    if (tail[0] !== 0x3b) return false;
    return true;
  }

  if (mt === 'image/webp') {
    // "RIFF" .... "WEBP"
    if (size < 12) return false;
    const head = readAt(filePath, 0, 12);
    if (head.length < 12) return false;
    const riffOk = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    const webpOk = head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    
    if (!riffOk || !webpOk) return false;
    
    // Note: RIFF size validation is optional - some WebP files may have extra data
    // The critical check is the RIFF and WEBP signatures which we already validated
    
    return true;
  }

  if (mt.startsWith('image/')) {
    // For unknown image types (e.g. svg, bmp, tiff), only enforce non-empty files
    // These types may not have strict validation rules
    if (size < MIN_UNKNOWN_IMAGE_SIZE) {
      console.warn('[fileValidation] Image file too small:', { filePath, size, mimetype: mt });
      return false;
    }
    return true;
  }

  // Videos
  if (mt === 'video/mp4') {
    // MP4 boxes often include 'ftyp' at offset 4.
    if (size < 12) return false;
    const head = readAt(filePath, 0, 12);
    if (head.length < 8) return false;
    const ftypOk = head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
    if (!ftypOk) {
      console.warn('[fileValidation] MP4 file missing ftyp atom:', filePath);
      return false;
    }
    return true;
  }

  if (mt.startsWith('video/')) {
    // For unknown video types, enforce minimum size
    if (size < 1024) {
      console.warn('[fileValidation] Video file too small:', { filePath, size, mimetype: mt });
      return false;
    }
    return true;
  }

  return true;
};
