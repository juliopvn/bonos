import { describe, expect, it } from 'vitest';
import { col } from '@/lib/db';
import { runPaymentsJob } from '@/lib/jobs/payments';
import { closeAndAllocate, placeOrder } from '@/lib/services/bookbuilding';
import { openBookbuilding, updateReferenceRate } from '@/lib/services/bonds';
import { d, makeBond, makeIssuer, makeUser, setupTestDb } from './helpers';

setupTestDb();

async function allocatedBond(name: string, over: Record<string, unknown> = {}) {
  const admin = await makeUser('admin@test.local', 'admin');
  const inv = await makeUser(`${name}@test.local`);
  const issuer = await makeIssuer(`Emisor ${name}`);
  const bond = await makeBond(admin._id, issuer._id, { totalUnits: 10, ...over });
  await openBookbuilding(admin._id, bond._id);
  await placeOrder(inv._id, { bondId: bond._id, units: 10, limitPriceBps: 10_000 });
  await closeAndAllocate(admin._id, bond._id, 10_000);
  return { admin, inv, bond };
}

describe('job de pagos', () => {
  it('es idempotente: ejecutarlo dos veces no duplica pagos ni alertas', async () => {
    const { inv, bond } = await allocatedBond('idem');
    const first = await runPaymentsJob(d('2030-07-15'));
    expect(first).toMatchObject({ activated: 1, paid: 1, matured: 0 });
    const second = await runPaymentsJob(d('2030-07-15'));
    expect(second).toEqual({ activated: 0, paid: 0, matured: 0 });

    const paid = await (await col('scheduledPayments')).find({ bondId: bond._id, status: 'paid' }).toArray();
    expect(paid).toHaveLength(1);
    expect(paid[0].amountCents).toBe(30_000); // 10 títulos × $30.00
    expect(await (await col('alerts')).countDocuments({ investorId: inv._id, type: 'payment' })).toBe(1);
    expect((await (await col('bonds')).findOne({ _id: bond._id }))?.status).toBe('active');
  });

  it('al vencimiento paga el principal, vence el bono y cierra posiciones', async () => {
    const { inv, bond } = await allocatedBond('mat');
    const res = await runPaymentsJob(d('2032-01-15'));
    expect(res.matured).toBeGreaterThanOrEqual(1); // incluye otros bonos del mismo vencimiento
    const after = await (await col('bonds')).findOne({ _id: bond._id });
    expect(after?.status).toBe('matured');
    expect((await (await col('positions')).findOne({ bondId: bond._id, investorId: inv._id }))?.units).toBe(0);
    expect(await (await col('scheduledPayments')).countDocuments({ bondId: bond._id, status: 'scheduled' })).toBe(0);
    // Re-ejecutar no cambia nada.
    expect(await runPaymentsJob(d('2032-01-15'))).toEqual({ activated: 0, paid: 0, matured: 0 });
  });

  it('tasa variable: recalcula solo los cupones futuros no pagados', async () => {
    const { admin, bond } = await allocatedBond('var', {
      couponType: 'floating', couponRateBps: undefined, referenceRateBps: 1000, spreadBps: 200, frequency: 4,
      issueDate: '2030-03-01', maturityDate: '2031-03-01',
    });
    // Primer cupón (trimestral, 12.00%): 100000 × 12% / 4 = 3000 por título.
    await runPaymentsJob(d('2030-06-01'));
    const paidBefore = await (await col('scheduledPayments')).findOne({ bondId: bond._id, type: 'coupon', status: 'paid' });
    expect(paidBefore?.amountCents).toBe(30_000);

    const { recalculated } = await updateReferenceRate(admin._id, bond._id, 1100); // 13.00% → 3250 por título
    expect(recalculated).toBe(3); // los 3 cupones restantes
    const coupons = await (await col('scheduledPayments')).find({ bondId: bond._id, type: 'coupon' }).sort({ dueDate: 1 }).toArray();
    expect(coupons[0].amountCents).toBe(30_000); // ya pagado: no cambia
    expect(coupons.slice(1).every((c) => c.amountCents === 32_500)).toBe(true);
  });

  it('rechaza actualizar tasa de referencia en bonos fijos', async () => {
    const { admin, bond } = await allocatedBond('fix');
    await expect(updateReferenceRate(admin._id, bond._id, 900)).rejects.toThrow(/tasa variable/);
  });
});
