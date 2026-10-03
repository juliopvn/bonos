import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { loginAndSave, USERS, type UserKey } from './support/auth';

/** Siembra el perfil e2e (reset) y deja un storageState por rol. */
export default async function globalSetup(_config: FullConfig) {
  void _config;
  console.log('[e2e] seed:reset (perfil e2e)…');
  execFileSync('pnpm', ['seed:reset'], {
    stdio: 'inherit',
    env: { ...process.env, SEED_PROFILE: 'e2e' },
  });

  mkdirSync('e2e/.auth', { recursive: true });
  const browser = await chromium.launch();
  for (const key of Object.keys(USERS) as UserKey[]) await loginAndSave(browser, key);
  await browser.close();
}
