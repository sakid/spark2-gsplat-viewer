import { defineConfig } from 'vitest/config';

// REFACTORED
export default defineConfig({
  server: {
    host: true,
    port: 5173
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.js'],
    exclude: ['vendor/**', 'node_modules/**']
  }
});
