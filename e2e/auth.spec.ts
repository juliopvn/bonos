import { expect, test } from '@playwright/test';
import { requestLoginLink, USERS } from './support/auth';

test.describe('autenticación con magic link', () => {
  test('el admin entra con el enlace del correo, ve su área y cierra sesión', async ({ page }) => {
    const link = await requestLoginLink(page, USERS.admin);
    await page.goto(link);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId('user-email')).toHaveText(USERS.admin);
    await page.locator('[data-testid=logout]:visible').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el inversor entra a su cartera', async ({ page }) => {
    await page.goto(await requestLoginLink(page, USERS.investor1));
    await expect(page).toHaveURL(/\/investor$/);
    await expect(page.getByRole('heading', { name: 'Mi cartera' })).toBeVisible();
  });

  test('un enlace ya usado falla', async ({ page, browser }) => {
    const link = await requestLoginLink(page, USERS.investor2);
    await page.goto(link);
    await expect(page).toHaveURL(/\/investor$/);

    const other = await browser.newContext();
    const second = await other.newPage();
    await second.goto(link);
    await expect(second).toHaveURL(/\/verify\?error=used/);
    await expect(second.getByTestId('verify-error')).toContainText('ya se usó');
    await other.close();
  });

  test('un token inválido muestra el error y permite pedir otro enlace', async ({ page }) => {
    await page.goto('/api/auth/verify?token=no-es-un-jwt');
    await expect(page).toHaveURL(/\/verify\?error=invalid/);
    await expect(page.getByTestId('verify-error')).toContainText('no es válido');
    await page.getByRole('link', { name: 'Pedir un enlace nuevo' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el login no revela si el correo existe (respuesta idéntica)', async ({ request }) => {
    const known = await request.post('/api/auth/request', { data: { email: USERS.admin } });
    const unknown = await request.post('/api/auth/request', {
      data: { email: 'nadie-existe@ejemplo.com' },
    });
    expect(known.status()).toBe(200);
    expect(unknown.status()).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });

  test('valida el correo en servidor', async ({ request }) => {
    const res = await request.post('/api/auth/request', { data: { email: 'no-es-correo' } });
    expect(res.status()).toBe(400);
  });
});
