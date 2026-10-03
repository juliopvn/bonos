import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'cobertura'],
      include: ['lib/domain/**', 'lib/money.ts', 'lib/bps.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
