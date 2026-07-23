import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@karu/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
