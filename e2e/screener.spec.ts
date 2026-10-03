import { expect, test, type Page } from '@playwright/test';
import { authFile } from './support/auth';
import { isoPlusMonths } from './support/helpers';

test.use({ storageState: authFile('investor1') });

// Otros archivos crean sus propias emisiones (ISS-*): aquí solo se comparan los bonos del seed.
const codes = async (page: Page) =>
  (
    await page
      .getByTestId('screener-row')
      .evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.code!))
  )
    .filter((c) => c.startsWith('E2E-'))
    .sort();

async function apply(page: Page, fill: () => Promise<unknown>) {
  await page.goto('/investor/screener');
  await fill();
  await page.getByTestId('f-apply').click();
  await page.waitForURL(/screener\?/);
}

test.describe('screener', () => {
  test('lista todos los bonos negociables del seed', async ({ page }) => {
    await page.goto('/investor/screener');
    expect(await codes(page)).toEqual(['E2E-ACT-1', 'E2E-ACT-2', 'E2E-ACT-3', 'E2E-BB-1']);
  });

  test('filtra por rango de rating', async ({ page }) => {
    await apply(page, async () => {
      await page.getByTestId('f-rating-min').selectOption('AAA');
      await page.getByTestId('f-rating-max').selectOption('A-');
    });
    expect(await codes(page)).toEqual(['E2E-ACT-1', 'E2E-ACT-2', 'E2E-BB-1']); // excluye BBB (Telecom Boreal)
  });

  test('filtra por rendimiento (YTM) mínimo', async ({ page }) => {
    await apply(page, () => page.getByTestId('f-ytm-min').fill('10'));
    expect(await codes(page)).toEqual(['E2E-ACT-2', 'E2E-ACT-3']);
    for (const t of await page.getByTestId('row-ytm').allInnerTexts())
      expect(parseFloat(t)).toBeGreaterThanOrEqual(10);
  });

  test('filtra por vencimiento y por sector', async ({ page }) => {
    await apply(page, () => page.getByTestId('f-maturity-to').fill(isoPlusMonths(30)));
    expect(await codes(page)).toEqual(['E2E-ACT-2']);
    await apply(page, () => page.getByTestId('f-sector').selectOption('Telecomunicaciones'));
    expect(await codes(page)).toEqual(['E2E-ACT-3']);
  });

  test('combina filtros y muestra el estado vacío cuando nada coincide', async ({ page }) => {
    await apply(page, async () => {
      await page.getByTestId('f-sector').selectOption('Energía');
      await page.getByTestId('f-ytm-min').fill('15');
    });
    await expect(page.getByTestId('empty')).toBeVisible();
    await expect(page.getByTestId('screener-count')).toContainText('0 bonos');
  });

  test('compra un bono activo y actualiza cartera y próximos cupones', async ({ page }) => {
    await page.goto('/investor/screener');
    await page.getByTestId('bond-link-E2E-ACT-3').click();
    await expect(page.getByTestId('bond-title')).toContainText('Boreal 2036');
    await page.getByTestId('buy-units').fill('5');
    await expect(page.getByTestId('buy-total')).toContainText('$4,750.00'); // 5 × $1,000 × 95%
    await page.getByTestId('buy-start').click();
    await page.getByTestId('buy-confirm').click();
    await expect(page).toHaveURL(/\/investor$/);
    const row = page.locator('[data-testid="position-row"][data-bond="E2E-ACT-3"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('$4,750.00');
    await expect(
      page.getByTestId('upcoming-coupon').filter({ hasText: 'Boreal 2036' }).first(),
    ).toBeVisible();
  });

  test('no permite comprar más que el inventario', async ({ page }) => {
    await page.goto('/investor/screener');
    await page.getByTestId('bond-link-E2E-ACT-2').click();
    await page.getByTestId('buy-units').fill('999999');
    await page.getByTestId('buy-start').click();
    await page.getByTestId('buy-confirm').click();
    await expect(page.getByTestId('toast-error')).toContainText('suficientes');
  });
});
