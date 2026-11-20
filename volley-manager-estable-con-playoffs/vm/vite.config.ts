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
    // The integration suite contains long-running season and fuzz tests.
    // Running files concurrently caused Vitest worker RPC timeouts on CI.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1
  },
  server: {
    host: '127.0.0.1'
  }
});
