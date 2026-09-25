import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.ts on purpose: these are plain unit tests over
 * data/logic (currently just i18n key parity), not component tests needing
 * jsdom/React — no point paying for that environment until something here
 * actually needs it.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
