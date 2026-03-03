import { defineConfig } from 'vitest/config';

// REFACTORED
const MODEL_FS_ROOT = '/Users/alyoshakidoguchi/Downloads';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [
        process.cwd(),
        MODEL_FS_ROOT
      ]
    }
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.js'],
    exclude: ['vendor/**', 'node_modules/**']
  }
});
