const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const baseUrl = process.env.BASE_URL || process.env.API_URL || 'http://localhost:5000';

function headRequest(url) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(url, { method: 'HEAD' }, (res) => {
        const headers = res.headers;
        resolve({ status: res.statusCode, headers });
      });
      req.on('error', (err) => resolve({ error: String(err) }));
      req.end();
    } catch (err) {
      resolve({ error: String(err) });
    }
  });
}

function fileHash(filePath) {
  try {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('Using base URL:', baseUrl);
  if (!fs.existsSync(uploadsDir)) {
    console.error('Uploads directory not found:', uploadsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(uploadsDir).filter(f => !f.startsWith('.'));
  if (files.length === 0) {
    console.log('No files in uploads directory:', uploadsDir);
    return;
  }

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    try {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      const hash = fileHash(filePath);
      console.log('\nFile:', file);
      console.log(' - Path:', filePath);
      console.log(' - Size:', size);
      console.log(' - SHA256:', hash || 'n/a');

      const url = `${baseUrl}/uploads/${encodeURIComponent(file)}`;
      const res = await headRequest(url);
      if (res.error) {
        console.log(' - HEAD error:', res.error);
      } else {
        console.log(' - HTTP status:', res.status);
        console.log(' - Response headers:', res.headers);
      }
    } catch (err) {
      console.error('Error reading file', filePath, err);
    }
  }
}

main().catch((e) => {
  console.error('check_uploads failed', e);
  process.exit(1);
});
