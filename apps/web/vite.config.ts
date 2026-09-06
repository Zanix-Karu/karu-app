import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Build stamp shown in the footer (and attached to feedback reports) so a bug
 * report or a "is my fix live?" question resolves to an exact build. Prefers
 * Vercel's commit SHA in CI, falls back to local git, then 'dev'.
 */
function appVersion(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    (() => {
      try {
        return execSync('git rev-parse --short HEAD').toString().trim();
      } catch {
        return 'dev';
      }
    })();
  return `${new Date().toISOString().slice(0, 10)}·${sha}`;
}

// Loads .env from the repo root (shared config) in addition to app-local files.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(__dirname, '../..'),
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  resolve: {
    alias: {
      '@karu/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: { port: 5173 },
});
