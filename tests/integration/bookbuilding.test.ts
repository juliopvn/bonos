import { describe, expect, it } from 'vitest';
import { col } from '@/lib/db';
import { flowsForUnits, generateSchedule } from '@/lib/domain/schedule';
import { closeAndAllocate, getBook, placeOrder } from '@/lib/services/bookbuilding';
import { openBookbuilding } from '@/lib/services/bonds';
import { d, mailTo, makeBond, makeIssuer, makeUser, setupTestDb } from './helpers';

setupTestDb();

describe('bookbuilding y adjudicación (Mongo real, transacción)', () => {
  it('con 3 inversores y sobresuscripción: Σ adjudicado = ofertado y pagos cuadran con la posición', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const [a, b, c] = await Promise.all(
      ['a@test.local', 'b@test.local', 'c@test.local'].map((e) => makeUser(e)),
    );
    const issuer = await makeIssuer('Emisor BB');
    const bond = await makeBond(admin._id, issuer._id, { totalUnits: 100 });
    await openBookbuilding(admin._id, bond._id);

    await placeOrder(a._id, { bondId: bond._id, units: 60, limitPriceBps: 10_050 });
    await placeOrder(b._id, { bondId: bond._id, units: 50, limitPriceBps: 10_000 });
    await placeOrder(c._id, { bondId: bond._id, units: 40, limitPriceBps: 9_900 }); // por debajo del precio final

    const book = await getBook(bond._id);
    expect(book.demand.totalUnits).toBe(150);
    expect(book.demand.coverageX100).toBe(150);

    const { allocatedUnits } = await closeAndAllocate(admin._id, bond._id, 10_000);
    expect(allocatedUnits).toBe(100); // = títulos ofertados

    const positions = await (await col('positions')).find({ bondId: bond._id }).toArray();
    expect(positions.reduce((s, p) => s + p.units, 0)).toBe(100);
    expect(positions.find((p) => p.investorId.equals(c._id))).toBeUndefined();

    // Los pagos programados de cada inversor cuadran con su posición.
    const perUnit = generateSchedule({
      nominalCents: 100_000,
      annualRateBps: 600,
      frequency: 2,
      dayCount: '30/360',
      issueDate: d('2030-01-15'),
      maturityDate: d('2032-01-15'),
    });
    for (const p of positions) {
      const pays = await (
        await col('scheduledPayments')
      )
        .find({ bondId: bond._id, investorId: p.investorId })
        .toArray();
      const expected = flowsForUnits(perUnit, p.units);
      expect(pays).toHaveLength(expected.length);
      expect(pays.reduce((s, x) => s + x.amountCents, 0)).toBe(
        expected.reduce((s, x) => s + x.amountCents, 0),
      );
      expect(pays.every((x) => x.status === 'scheduled')).toBe(true);
    }

    const after = await (await col('bonds')).findOne({ _id: bond._id });
    expect(after).toMatchObject({
      status: 'allocated',
      finalPriceBps: 10_000,
      marketPriceBps: 10_000,
      availableUnits: 0,
    });
    const orders = await (await col('orders')).find({ bondId: bond._id }).toArray();
    expect(orders.filter((o) => o.status === 'rejected')).toHaveLength(1);
    expect(orders.every((o) => o.status !== 'pending')).toBe(true);

    // Email de adjudicación solo a quienes recibieron títulos.
    expect((await mailTo('a@test.local')).some((m) => m.subject.startsWith('Adjudicación'))).toBe(
      true,
    );
    expect((await mailTo('c@test.local')).some((m) => m.subject.startsWith('Adjudicación'))).toBe(
      true,
    ); // c fue notificado (0 títulos)
  });

  it('no permite adjudicar dos veces ni órdenes con el libro cerrado', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const inv = await makeUser('x@test.local');
    const issuer = await makeIssuer('Emisor BB2');
    const bond = await makeBond(admin._id, issuer._id);
    await expect(
      placeOrder(inv._id, { bondId: bond._id, units: 1, limitPriceBps: 10_000 }),
    ).rejects.toThrow(/no está abierto/);
    await openBookbuilding(admin._id, bond._id);
    await expect(closeAndAllocate(admin._id, bond._id, 10_000)).rejects.toThrow(/no tiene órdenes/);
    await placeOrder(inv._id, { bondId: bond._id, units: 5, limitPriceBps: 10_000 });
    await closeAndAllocate(admin._id, bond._id, 10_000);
    await expect(closeAndAllocate(admin._id, bond._id, 10_000)).rejects.toThrow(
      /no está en bookbuilding/,
    );
    // Infrasuscripción: el resto queda como inventario del mercado secundario.
    const after = await (await col('bonds')).findOne({ _id: bond._id });
    expect(after?.availableUnits).toBe(95);
  });

  it('la transacción es atómica: si falla a mitad, no queda nada a medias', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const inv = await makeUser('atomic@test.local');
    const issuer = await makeIssuer('Emisor BB3');
    const bond = await makeBond(admin._id, issuer._id, { totalUnits: 10 });
    await openBookbuilding(admin._id, bond._id);
    await placeOrder(inv._id, { bondId: bond._id, units: 5, limitPriceBps: 10_000 });
    // Un pago duplicado preexistente rompe el índice único dentro de la transacción.
    const first = generateSchedule({
      nominalCents: 100_000,
      annualRateBps: 600,
      frequency: 2,
      dayCount: '30/360',
      issueDate: d('2030-01-15'),
      maturityDate: d('2032-01-15'),
    })[0];
    await (
      await col('scheduledPayments')
    ).insertOne({
      _id: new (await import('mongodb')).ObjectId(),
      bondId: bond._id,
      investorId: inv._id,
      type: first.type,
      dueDate: first.dueDate,
      amountCents: 1,
      status: 'scheduled',
      paidAt: null,
    });
    await expect(closeAndAllocate(admin._id, bond._id, 10_000)).rejects.toThrow();
    const after = await (await col('bonds')).findOne({ _id: bond._id });
    expect(after?.status).toBe('bookbuilding');
    expect(await (await col('positions')).countDocuments({ bondId: bond._id })).toBe(0);
    const order = await (await col('orders')).findOne({ bondId: bond._id });
    expect(order?.status).toBe('pending');
  });
});
