import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { col } from '@/lib/db';
import { runPaymentsJob } from '@/lib/jobs/payments';
import { closeAndAllocate, placeOrder } from '@/lib/services/bookbuilding';
import { openBookbuilding, updateMarketPrice } from '@/lib/services/bonds';
import { getPortfolio } from '@/lib/services/portfolio';
import { buyActiveBond } from '@/lib/services/trading';
import { d, makeBond, makeIssuer, makeUser, setupTestDb } from './helpers';

setupTestDb();

describe('tablero de posición vs cálculo independiente', () => {
  it('valor de mercado, P&L, cobrado y por cobrar coinciden', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const inv = await makeUser('cartera@test.local');
    const issuer = await makeIssuer('Emisor Cartera', 'A', 'Consumo');
    // Bono activo (emitido en 2020): 100 títulos, nominal $1,000, cupón 6% semestral.
    const bond = await makeBond(admin._id, issuer._id, {
      issueDate: '2020-01-15',
      maturityDate: '2040-01-15',
      totalUnits: 100,
    });
    await openBookbuilding(admin._id, bond._id);
    await placeOrder(inv._id, { bondId: bond._id, units: 20, limitPriceBps: 9_800 });
    await closeAndAllocate(admin._id, bond._id, 9_800); // costo medio 98.00
    await updateMarketPrice(admin._id, bond._id, 10_150); // hoy (misma fecha que la adjudicación)

    const p = await getPortfolio(inv._id, d('2026-03-01'));
    // ── Cálculo independiente con aritmética de enteros escrita a mano ──
    const units = 20,
      nominal = 100_000;
    const market = (units * nominal * 10_150) / 10_000; // 2,030,000
    const cost = (units * nominal * 9_800) / 10_000; // 1,960,000
    expect(p.marketValueCents).toBe(market);
    expect(p.costCents).toBe(cost);
    expect(p.pnlCents).toBe(market - cost);
    expect(p.rows).toHaveLength(1);

    // Pagos: el job de 2026-03-01 cobra los cupones semestrales vencidos (15-jul y 15-ene).
    await runPaymentsJob(d('2026-03-01'));
    const after = await getPortfolio(inv._id, d('2026-03-01'));
    const paid = await (
      await col('scheduledPayments')
    )
      .find({ investorId: inv._id, status: 'paid' })
      .toArray();
    const couponsPaid = paid.filter((x) => x.type === 'coupon').length;
    expect(after.collectedCents).toBe(couponsPaid * 20 * 3_000);
    const remainingCoupons = 28 - couponsPaid; // 20 años × 2 = 40 cupones totales
    expect(after.upcomingCents).toBeGreaterThan(0);
    expect(after.upcomingCents).toBe((40 - couponsPaid) * 20 * 3_000 + 20 * nominal);
    expect(remainingCoupons).toBeLessThan(40);
    expect(after.upcoming[0].dueDate >= d('2026-03-01')).toBe(true);
    expect(after.byRating).toEqual([{ key: 'A', valueCents: market, shareBps: 10_000 }]);
    expect(after.performance.at(-1)?.totalCents).toBe(market + after.collectedCents);
  });

  it('compra en mercado secundario: posición, costo medio y pagos restantes acumulados', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const inv = await makeUser('compra@test.local');
    const issuer = await makeIssuer('Emisor Compra');
    const bond = await makeBond(admin._id, issuer._id, {
      issueDate: '2020-01-15',
      maturityDate: '2040-01-15',
      totalUnits: 50,
    });
    // Se coloca el 20% y el resto queda como inventario.
    const seed = await makeUser('seed@test.local');
    await openBookbuilding(admin._id, bond._id);
    await placeOrder(seed._id, { bondId: bond._id, units: 10, limitPriceBps: 10_000 });
    await closeAndAllocate(admin._id, bond._id, 10_000);
    expect((await (await col('bonds')).findOne({ _id: bond._id }))?.availableUnits).toBe(40);
    await updateMarketPrice(admin._id, bond._id, 9_500, d('2026-03-01'));

    const first = await buyActiveBond(inv._id, bond._id, 10);
    expect(first).toEqual({ priceBps: 9_500, amountCents: 950_000 });
    await updateMarketPrice(admin._id, bond._id, 10_500, d('2026-03-02'));
    await buyActiveBond(inv._id, bond._id, 10);

    const pos = await (await col('positions')).findOne({ investorId: inv._id, bondId: bond._id });
    expect(pos).toMatchObject({ units: 20, avgCostBps: 10_000 }); // (10×95 + 10×105) / 20
    const pays = await (
      await col('scheduledPayments')
    )
      .find({ investorId: inv._id, bondId: bond._id, type: 'principal' })
      .toArray();
    expect(pays).toHaveLength(1); // se acumula en un solo documento
    expect(pays[0].amountCents).toBe(20 * 100_000);
    expect((await (await col('bonds')).findOne({ _id: bond._id }))?.availableUnits).toBe(20);

    await expect(buyActiveBond(inv._id, bond._id, 21)).rejects.toThrow(/suficientes/);
    await expect(buyActiveBond(inv._id, new ObjectId(), 1)).rejects.toThrow();
  });
});
