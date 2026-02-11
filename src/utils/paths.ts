import path from 'path';
const cwd = process.cwd();
const backendRootDir =
  path.basename(cwd).toLowerCase() === 'backe' ? cwd : path.resolve(cwd, 'backe');
export { backendRootDir };

export const repoRootDir = path.resolve(backendRootDir, '..'); // repo root

// Canonical uploads directory (new uploads land here).
export const uploadsDir = path.resolve(backendRootDir, 'uploads');

// Legacy uploads directory (some runs used repoRoot/uploads when started from repo root).
export const legacyUploadsDir = path.resolve(repoRootDir, 'uploads');

export const frontendDistDir = path.resolve(repoRootDir, 'frontend', 'dist');
export const frontendPublicDir = path.resolve(repoRootDir, 'frontend', 'public');
