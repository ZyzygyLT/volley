import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true
  },
  test: {
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Keep the long-running integration suite sequential and isolate it from
    // the Vitest coordinator so CPU-heavy simulations cannot starve worker RPC.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1
  },
  server: {
    host: '127.0.0.1'
  }
});
