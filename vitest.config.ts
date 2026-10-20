import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // keep the cache inside this project even when a tool is run from a parent directory
  cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // the publish preview injects its own sheets (`?inline`); its tests check them
    css: { include: [/\/src\/preview\//] },
  },
});
