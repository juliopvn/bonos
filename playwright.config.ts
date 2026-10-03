import { defineConfig, devices } from '@playwright/test';

/**
 * E2E con dos modos (misma suite):
 *  - Local con Docker (por defecto): Mongo (rs) + MailHog + RustFS.  E2E_MAILBOX=mailhog
 *  - CI sin Docker: mongodb-memory-server + MAIL_DRIVER=memory + STORAGE_DRIVER=fs.  E2E_MAILBOX=memory E2E_MONGO=memory
 * Los tests corren contra una base propia (bonds_e2e) para no tocar los datos de desarrollo.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const memoryMail = (process.env.E2E_MAILBOX ?? 'mailhog') === 'memory';
const memoryMongo = (process.env.E2E_MONGO ?? 'external') === 'memory';
const smokeOnly = process.argv.includes('--project=smoke') || process.argv.includes('smoke');

const env: Record<string, string> = {
  NODE_ENV: 'production',
  E2E_MODE: 'true',
  SEED_PROFILE: 'e2e',
  APP_URL: `http://localhost:${PORT}`,
  BASE_URL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
  MONGODB_DB: process.env.E2E_DB ?? 'bonds_e2e',
  AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
  CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret',
  ADMIN_EMAILS: 'admin@demo.local',
  AUTH_RATE_LIMIT_MAX: '1000',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
};
if (memoryMail)
  Object.assign(env, {
    MAIL_DRIVER: 'memory',
    STORAGE_DRIVER: 'fs',
    STORAGE_FS_DIR: '.tmp/e2e-storage',
  });
if (memoryMongo) env.MONGODB_URI = 'mongodb://127.0.0.1:27117/?replicaSet=rs0';
env.E2E_MAILBOX = memoryMail ? 'memory' : 'mailhog';
Object.assign(process.env, env); // lo heredan webServer, globalSetup y workers

export default defineConfig({
  testDir: './e2e',
  globalSetup: smokeOnly ? undefined : './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
        ['html', { open: 'never' }],
      ]
    : [['list']],
  use: {
    baseURL: env.BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-MX',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [/smoke\//, /mobile\.spec\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'smoke', testMatch: /smoke\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: smokeOnly
    ? undefined
    : {
        command: 'pnpm exec tsx scripts/e2e-server.ts',
        url: `${env.BASE_URL}/api/health`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
