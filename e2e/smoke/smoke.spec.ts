import { expect, test } from '@playwright/test';

/** Smoke de producción (BASE_URL=https://…). No requiere correo ni datos de prueba. */
test('login carga', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Entra con tu correo/ })).toBeVisible();
});

test('/api/health responde ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe('ok');
});

test('las rutas protegidas redirigen a /login', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get('/api/admin/issuers')).status()).toBe(401);
});

test('cabeceras de seguridad presentes', async ({ request }) => {
  const h = (await request.get('/login')).headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['content-security-policy']).toBeTruthy();
  expect(h['referrer-policy']).toBeTruthy();
});

test('/api/test/* no existe en producción', async ({ request }) => {
  expect((await request.get('/api/test/mailbox')).status()).toBe(404);
});
