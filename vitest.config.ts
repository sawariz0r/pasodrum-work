import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.{ts,tsx}', 'services/*/src/**/*.test.ts'],
    setupFiles: ['apps/web/src/app/testing/setup.ts'],
  },
});
