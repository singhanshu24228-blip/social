import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    const err = new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
    err.code = result.status;
    throw err;
  }
}

function resolveRepoRoot(startDir) {
  const isRepoRoot = (dir) =>
    existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'backe', 'package.json'));

  if (isRepoRoot(startDir)) return startDir;

  const base = path.basename(startDir).toLowerCase();
  if ((base === 'backe' || base === 'frontend') && isRepoRoot(path.resolve(startDir, '..'))) {
    return path.resolve(startDir, '..');
  }

  // Render can be configured with "Root Directory" = backe/; in that case builds should still run from repo root.
  // Also handles running the build script from nested folders locally.
  let cur = startDir;
  for (let i = 0; i < 5; i++) {
    const parent = path.resolve(cur, '..');
    if (parent === cur) break;
    if (isRepoRoot(parent)) return parent;
    cur = parent;
  }

  return startDir;
}

const repoRoot = resolveRepoRoot(process.cwd());
console.log(`[build] repoRoot=${repoRoot}`);
const backePackageJson = path.join(repoRoot, 'backe', 'package.json');
const backeNodeModules = path.join(repoRoot, 'backe', 'node_modules');
const backePackageLock = path.join(repoRoot, 'backe', 'package-lock.json');
const frontendPackageJson = path.join(repoRoot, 'frontend', 'package.json');
const frontendNodeModules = path.join(repoRoot, 'frontend', 'node_modules');
const frontendPackageLock = path.join(repoRoot, 'frontend', 'package-lock.json');
const gitmodulesPath = path.join(repoRoot, '.gitmodules');

// On Render/Linux, folders like `backe/` or `frontend/` can be git submodules; they won't exist unless submodules are fetched.
// On Windows local dev, running `git submodule update` can fail in some environments, so only try it when needed.
if (!existsSync(backePackageJson) || !existsSync(frontendPackageJson)) {
  const canTryGit = process.platform !== 'win32';
  if (canTryGit && existsSync(gitmodulesPath)) {
    console.log('[build] Initializing git submodules...');
    run('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot });
  }
}

if (!existsSync(backePackageJson)) {
  console.error('[build] Missing backe/package.json.');
  if (!existsSync(gitmodulesPath)) {
    console.error('[build] This repo references `backe` as a git submodule, but `.gitmodules` is missing.');
    console.error('[build] Fix options:');
    console.error('[build]  1) Commit a `.gitmodules` file with the `backe` submodule URL, and enable "Git Submodules" on Render.');
    console.error('[build]  2) Remove submodules and commit `backe/` as a normal folder in this repo.');
  } else {
    console.error('[build] If deploying on Render, enable "Git Submodules" or run `git submodule update --init --recursive` during build.');
  }
  process.exit(1);
}

console.log('[build] Installing backend dependencies...');
if (!existsSync(backeNodeModules)) {
  // Render runs `npm install` at repo root by default, but `backe/` is its own package.
  // Only install when needed to avoid local env issues.
  if (existsSync(backePackageLock)) {
    run('npm', ['--prefix', 'backe', 'ci'], { cwd: repoRoot });
  } else {
    run('npm', ['--prefix', 'backe', 'install'], { cwd: repoRoot });
  }
} else {
  console.log('[build] backe/node_modules already present; skipping install.');
}

if (existsSync(frontendPackageJson)) {
  console.log('[build] Installing frontend dependencies...');
  if (!existsSync(frontendNodeModules)) {
    if (existsSync(frontendPackageLock)) {
      run('npm', ['--prefix', 'frontend', 'ci'], { cwd: repoRoot });
    } else {
      run('npm', ['--prefix', 'frontend', 'install'], { cwd: repoRoot });
    }
  } else {
    console.log('[build] frontend/node_modules already present; skipping install.');
  }

  console.log('[build] Building frontend...');
  run('npm', ['--prefix', 'frontend', 'run', 'build'], { cwd: repoRoot });
} else {
  console.warn('[build] frontend/package.json not found; skipping frontend build.');
}

console.log('[build] Building backend...');
run('npm', ['--prefix', 'backe', 'run', 'build'], { cwd: repoRoot });
