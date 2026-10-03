import { expect, test } from '@playwright/test';
import { authFile } from './support/auth';
import { centsFrom } from './support/helpers';
import { runCron } from './support/jobs';

test.use({ storageState: authFile('investor1') });

test('jobs: simular la fecha de un cupón lo registra como cobrado y es idempotente', async ({
  page,
  request,
}) => {
  await page.goto('/investor');
  const before = centsFrom(await page.getByTestId('kpi-collected').innerText());
  const next = page.getByTestId('upcoming-coupon').first();
  const date = (await next.getAttribute('data-date'))!;
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const first = await runCron(request, 'payments', date);
  expect(first.paid).toBeGreaterThanOrEqual(1);
  const second = await runCron(request, 'payments', date);
  expect(second).toEqual({ activated: 0, paid: 0, matured: 0 }); // idempotente

  await page.reload();
  const after = centsFrom(await page.getByTestId('kpi-collected').innerText());
  expect(after).toBeGreaterThan(before);
  // El cupón pagado ya no figura entre los próximos y el inversor recibe la alerta de pago.
  await expect(page.locator(`[data-testid="upcoming-coupon"][data-date="${date}"]`)).toHaveCount(0);
  await page.goto('/investor/alerts');
  await expect(
    page
      .getByTestId('alert-item')
      .filter({ hasText: /Cupón cobrado|Principal cobrado/ })
      .first(),
  ).toBeVisible();
});
