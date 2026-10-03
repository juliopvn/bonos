import { expect, test } from '@playwright/test';
import { authFile } from './support/auth';

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('el login se adapta a móvil', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test.describe('con sesión de inversor', () => {
  test.use({ storageState: authFile('investor1') });

  test('la cartera y el screener no desbordan el viewport y la navegación funciona', async ({
    page,
  }) => {
    await page.goto('/investor');
    await expect(page.getByRole('heading', { name: 'Mi cartera' })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByTestId('nav-screener').click();
    await expect(page).toHaveURL(/\/investor\/screener/);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.locator('[data-testid=logout]:visible').click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
