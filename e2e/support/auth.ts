import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { magicLinkFrom, waitForMail } from './mailbox';

export const USERS = {
  admin: 'admin@demo.local',
  investor1: 'investor1@demo.local',
  investor2: 'investor2@demo.local',
  investor3: 'investor3@demo.local',
} as const;

export type UserKey = keyof typeof USERS;
export const authFile = (key: UserKey) => path.resolve(__dirname, `../.auth/${key}.json`);

/** Pide el magic link desde la UI y devuelve el enlace leído del buzón. */
export async function requestLoginLink(page: Page, email: string): Promise<string> {
  const since = new Date(Date.now() - 1000);
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-sent')).toBeVisible();
  return magicLinkFrom(await waitForMail(email, { since, subject: /enlace de acceso/i }));
}

/** Login completo (solicita, lee el correo, abre el enlace) y guarda el storageState del rol. */
export async function loginAndSave(browser: Browser, key: UserKey): Promise<void> {
  const context: BrowserContext = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await context.newPage();
  const link = await requestLoginLink(page, USERS[key]);
  await page.goto(link);
  await expect(page).toHaveURL(key === 'admin' ? /\/admin$/ : /\/investor$/);
  await context.storageState({ path: authFile(key) });
  await context.close();
}
