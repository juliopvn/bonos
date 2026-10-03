import { expect, test } from '@playwright/test';
import { authFile, USERS } from './support/auth';
import { countMails, waitForMail } from './support/mailbox';

// Deja el rating como estaba: los demás archivos (p. ej. el screener) no dependen del orden de ejecución.
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('admin') });
  const { items } = await (await ctx.request.get('/api/admin/issuers')).json();
  const aurora = items.find((i: { name: string }) => i.name === 'Aurora Energía');
  await ctx.request.post(`/api/admin/issuers/${aurora._id}/rating`, { data: { rating: 'AA' } });
  await ctx.close();
});

test('cambiar el rating de un emisor alerta (in-app y email) solo a los inversores afectados', async ({
  browser,
}) => {
  const since = new Date(Date.now() - 2000);
  const adminCtx = await browser.newContext({ storageState: authFile('admin') });
  const admin = await adminCtx.newPage();
  await admin.goto('/admin/issuers');
  await admin.getByTestId('rating-select-Aurora Energía').selectOption('BBB');
  await admin.getByTestId('rating-save-Aurora Energía').click();
  await expect(admin.getByTestId('toast-success')).toContainText('Alertas enviadas: 1'); // solo investor1 posee Aurora
  await adminCtx.close();

  // Afectado: investor1 (posee E2E-ACT-1 de Aurora).
  const affected = await browser.newContext({ storageState: authFile('investor1') });
  const page = await affected.newPage();
  await page.goto('/investor/alerts');
  const item = page
    .getByTestId('alert-item')
    .filter({ hasText: 'Cambio de rating: Aurora Energía' });
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-read', 'false');
  await expect(item).toContainText('AA a BBB');
  await expect(page.getByTestId('alerts-badge')).toBeVisible();
  expect(
    (await waitForMail(USERS.investor1, { since, subject: /Alerta: Cambio de rating/ })).subject,
  ).toContain('Aurora');

  // Marcar como leída baja el contador.
  await item.getByTestId('mark-read').click();
  await expect(item).toHaveAttribute('data-read', 'true');
  await affected.close();

  // No afectados: ni alerta in-app ni correo.
  for (const user of ['investor2', 'investor3'] as const) {
    const ctx = await browser.newContext({ storageState: authFile(user) });
    const p = await ctx.newPage();
    await p.goto('/investor/alerts');
    await expect(p.getByTestId('alert-item').filter({ hasText: 'Aurora' })).toHaveCount(0);
    expect(await countMails(USERS[user], since, /Alerta: Cambio de rating/)).toBe(0);
    await ctx.close();
  }
});

test('las preferencias de alertas se guardan', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile('investor3') });
  const page = await ctx.newPage();
  await page.goto('/investor/alerts');
  await page.getByTestId('pref-price').fill('350');
  await page.getByTestId('pref-concentration').fill('45');
  await page.getByTestId('pref-save').click();
  await expect(page.getByTestId('toast-success')).toContainText('Preferencias guardadas');
  await page.reload();
  await expect(page.getByTestId('pref-price')).toHaveValue('350');
  await expect(page.getByTestId('pref-concentration')).toHaveValue('45');
  await ctx.close();
});
