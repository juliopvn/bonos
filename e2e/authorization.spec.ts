import { expect, test } from '@playwright/test';
import { authFile } from './support/auth';

test.describe('autorización negativa', () => {
  test.describe('sin sesión', () => {
    test('las rutas protegidas redirigen a /login y las APIs responden 401', async ({
      page,
      request,
    }) => {
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/login$/);
      await page.goto('/investor/screener');
      await expect(page).toHaveURL(/\/login$/);
      for (const url of ['/api/admin/issuers', '/api/bonds', '/api/portfolio', '/api/me']) {
        expect((await request.get(url)).status(), url).toBe(401);
      }
    });

    test('el cron exige CRON_SECRET', async ({ request }) => {
      expect((await request.post('/api/cron/payments')).status()).toBe(401);
      expect(
        (
          await request.post('/api/cron/alerts', {
            headers: { Authorization: 'Bearer incorrecto' },
          })
        ).status(),
      ).toBe(401);
    });
  });

  test.describe('como inversor', () => {
    test.use({ storageState: authFile('investor1') });

    test('no accede a /admin y es redirigido a su cartera', async ({ page }) => {
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/investor$/);
      await page.goto('/admin/bonds/new');
      await expect(page).toHaveURL(/\/investor$/);
    });

    test('recibe 403 en cualquier /api/admin/*', async ({ request }) => {
      const id = '0123456789abcdef01234567';
      const gets = [
        '/api/admin/issuers',
        '/api/admin/bonds',
        '/api/admin/payments',
        `/api/admin/bonds/${id}/book`,
        `/api/admin/bonds/${id}/covenants`,
      ];
      for (const url of gets) expect((await request.get(url)).status(), url).toBe(403);
      const posts = [
        '/api/admin/issuers',
        '/api/admin/bonds',
        '/api/admin/bonds/preview',
        `/api/admin/bonds/${id}/open`,
        `/api/admin/bonds/${id}/allocate`,
        `/api/admin/bonds/${id}/report`,
        `/api/admin/issuers/${id}/rating`,
      ];
      for (const url of posts)
        expect((await request.post(url, { data: {} })).status(), url).toBe(403);
      expect(
        (await request.patch(`/api/admin/covenants/${id}`, { data: { status: 'ok' } })).status(),
      ).toBe(403);
    });
  });

  test.describe('como admin', () => {
    test.use({ storageState: authFile('admin') });

    test('no usa las APIs de inversor ni entra al área de inversor', async ({ page, request }) => {
      expect((await request.get('/api/portfolio')).status()).toBe(403);
      expect((await request.get('/api/orders')).status()).toBe(403);
      expect((await request.post('/api/portfolio/buy', { data: {} })).status()).toBe(403);
      await page.goto('/investor');
      await expect(page).toHaveURL(/\/admin$/);
    });
  });

  test('las cabeceras de seguridad están presentes', async ({ request }) => {
    const res = await request.get('/login');
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('/api/test/* solo existe con E2E_MODE (aquí sí) y el buzón no filtra sin parámetros inválidos', async ({
    request,
  }) => {
    expect((await request.get('/api/test/mailbox?to=nadie@x.com')).status()).toBe(200);
  });
});
