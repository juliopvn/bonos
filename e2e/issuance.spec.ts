import { expect, test } from '@playwright/test';
import { authFile, USERS } from './support/auth';
import { isoPlusDays, isoPlusMonths } from './support/helpers';
import { waitForMail } from './support/mailbox';

const suffix = Date.now().toString(36).toUpperCase();
const issuerName = `Emisor E2E ${suffix}`;
const bondName = `Bono E2E ${suffix}`;
const bondCode = `ISS-${suffix}`;

/** Flujos 2, 3 y 4: estructurar → bookbuilding con demanda en vivo → adjudicar → posiciones y correo. */
test.describe.serial('emisión, bookbuilding y adjudicación', () => {
  const startedAt = new Date(Date.now() - 2000);
  let bondId = '';

  test('el admin crea un emisor', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile('admin') });
    const page = await ctx.newPage();
    await page.goto('/admin/issuers');
    await page.getByTestId('issuer-name').fill(issuerName);
    await page.getByTestId('issuer-sector').fill('Servicios');
    await page.getByTestId('issuer-rating').selectOption('A+');
    await page.getByTestId('issuer-submit').click();
    await expect(page.getByTestId(`issuer-row-${issuerName}`)).toContainText('A+');
    await ctx.close();
  });

  test('el admin estructura la emisión, revisa el calendario y abre el bookbuilding', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: authFile('admin') });
    const page = await ctx.newPage();
    await page.goto('/admin/bonds/new');
    await page.getByTestId('bond-issuer').selectOption({ label: `${issuerName} · A+` });
    await page.getByTestId('bond-name').fill(bondName);
    await page.getByTestId('bond-code').fill(bondCode);
    await page.getByTestId('bond-nominal').fill('1000.00');
    await page.getByTestId('bond-units').fill('100');
    await page.getByTestId('bond-rate').fill('7.00');
    await page.getByTestId('bond-frequency').selectOption('2');
    await page.getByTestId('bond-issue').fill(isoPlusDays(30));
    await page.getByTestId('bond-maturity').fill(isoPlusMonths(37));

    // Calendario previsto antes de publicar: el plazo se muestra derivado.
    await expect(page.getByTestId('derived-term')).toContainText('Medio');
    await expect.poll(() => page.getByTestId('schedule-row').count()).toBeGreaterThanOrEqual(7);
    await expect(page.getByTestId('schedule-row').last()).toContainText('Principal');

    await page.getByTestId('bond-submit').click();
    await expect(page).toHaveURL(/\/admin\/bonds\/[0-9a-f]{24}$/);
    bondId = page.url().split('/').pop()!;
    await expect(page.getByTestId('bond-title')).toHaveText(bondName);
    await expect(page.getByTestId('bond-status').first()).toHaveText('Borrador');

    await page.getByTestId('open-book').click();
    await expect(page.getByTestId('bond-status').first()).toHaveText('Bookbuilding');
    await ctx.close();
  });

  test('dos inversores colocan órdenes y el admin ve la demanda agregada actualizarse', async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext({ storageState: authFile('admin') });
    const admin = await adminCtx.newPage();
    await admin.goto(`/admin/bookbuilding/${bondId}`);
    await expect(admin.getByTestId('book-orders')).toHaveText('0');
    await expect(admin.getByTestId('book-empty')).toBeVisible();

    const place = async (user: 'investor1' | 'investor2', units: string, limit: string) => {
      const ctx = await browser.newContext({ storageState: authFile(user) });
      const page = await ctx.newPage();
      await page.goto(`/investor/bonds/${bondId}`);
      await page.getByTestId('buy-units').fill(units);
      await page.getByTestId('buy-limit').fill(limit);
      await expect(page.getByTestId('buy-total')).toContainText('Importe estimado');
      await page.getByTestId('buy-start').click();
      await page.getByTestId('buy-confirm').click();
      await expect(page).toHaveURL(/\/investor\/orders$/);
      await expect(page.getByTestId('order-row').first()).toHaveAttribute('data-status', 'pending');
      await ctx.close();
    };
    await place('investor1', '70', '100.50');
    await place('investor2', '60', '100.00');

    // Polling cada 3 s: sin recargar, el libro refleja las dos órdenes.
    await expect(admin.getByTestId('book-orders')).toHaveText('2', { timeout: 12_000 });
    await expect(admin.getByTestId('book-demand')).toHaveText('130');
    await expect(admin.getByTestId('book-coverage')).toHaveText('1.30×');
    await expect(admin.getByTestId('demand-level')).toHaveCount(2);
    await adminCtx.close();
  });

  test('el admin cierra el libro, fija el precio y adjudica con prorrateo', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile('admin') });
    const page = await ctx.newPage();
    await page.goto(`/admin/bookbuilding/${bondId}`);
    await page.getByTestId('final-price').fill('100.00');
    await expect(page.getByTestId('projection')).toContainText('100 de 100 títulos');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('allocate').click();
    await expect(page.getByTestId('toast-success')).toContainText('Adjudicados 100 títulos');
    await expect(page.getByTestId('book-closed')).toBeVisible();
    await ctx.close();
  });

  test('los inversores ven su posición y próximos cupones, y reciben el correo de adjudicación', async ({
    browser,
  }) => {
    // 130 pedidos para 100 títulos: floor(70×100/130)=53, floor(60×100/130)=46 y el residuo (1) va a la primera orden → 54 / 46.
    for (const [user, units] of [
      ['investor1', '54'],
      ['investor2', '46'],
    ] as const) {
      const ctx = await browser.newContext({ storageState: authFile(user) });
      const page = await ctx.newPage();
      await page.goto('/investor');
      const row = page.locator(`[data-testid="position-row"][data-bond="${bondCode}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(units);
      await expect(
        page.getByTestId('upcoming-coupon').filter({ hasText: bondName }).first(),
      ).toBeVisible();

      const mail = await waitForMail(USERS[user], { since: startedAt, subject: /Adjudicación/ });
      expect(mail.subject).toContain(bondName);
      await ctx.close();
    }
  });
});
