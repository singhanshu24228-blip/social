import { start } from './index.js';

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});

