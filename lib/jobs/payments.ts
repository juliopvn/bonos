import { ObjectId } from 'mongodb';
import { col } from '../db';
import { formatMoney } from '../money';
import { dedupe } from '../domain/alerts';
import { toISODate } from '../domain/dates';
import { createAlert } from '../services/alerts';

export interface PaymentsJobResult {
  activated: number;
  paid: number;
  matured: number;
}

/**
 * Paga los `scheduledPayments` con vencimiento ≤ `asOf`, genera la alerta de pago y,
 * al pagar el principal, vence el bono y cierra posiciones. Idempotente: cada pago
 * se marca con una actualización atómica condicionada a `status: 'scheduled'`.
 */
export async function runPaymentsJob(asOf: Date): Promise<PaymentsJobResult> {
  const [bonds, payments, positions] = await Promise.all([
    col('bonds'),
    col('scheduledPayments'),
    col('positions'),
  ]);

  // 1. Bonos adjudicados cuya fecha de emisión ya llegó pasan a vigentes.
  const activated = (
    await bonds.updateMany(
      { status: 'allocated', issueDate: { $lte: asOf } },
      { $set: { status: 'active' } },
    )
  ).modifiedCount;

  // 2. Pagos vencidos.
  const due = await payments
    .find({ status: 'scheduled', dueDate: { $lte: asOf } })
    .sort({ dueDate: 1 })
    .toArray();
  let paid = 0;
  const touchedBonds = new Set<string>();
  const bondCache = new Map<string, { name: string }>();

  for (const p of due) {
    const res = await payments.updateOne(
      { _id: p._id, status: 'scheduled' },
      { $set: { status: 'paid', paidAt: asOf } },
    );
    if (res.modifiedCount === 0) continue; // otro proceso ya lo pagó
    paid++;
    touchedBonds.add(p.bondId.toHexString());

    let bond = bondCache.get(p.bondId.toHexString());
    if (!bond) {
      bond = (await bonds.findOne({ _id: p.bondId }, { projection: { name: 1 } })) ?? {
        name: 'Bono',
      };
      bondCache.set(p.bondId.toHexString(), bond);
    }
    await createAlert(
      p.investorId,
      'payment',
      {
        title:
          p.type === 'principal'
            ? `Principal cobrado: ${bond.name}`
            : `Cupón cobrado: ${bond.name}`,
        detail: `Se acreditaron ${formatMoney(p.amountCents)} el ${toISODate(p.dueDate)}.`,
        bondId: p.bondId.toHexString(),
        amountCents: p.amountCents,
      },
      dedupe.payment(p._id.toHexString()),
    );
  }

  // 3. Bonos cuyo principal ya se pagó: vencidos y posiciones cerradas.
  let matured = 0;
  for (const bondId of touchedBonds) {
    const id = new ObjectId(bondId);
    const pendingPrincipal = await payments.countDocuments({
      bondId: id,
      type: 'principal',
      status: 'scheduled',
    });
    const paidPrincipal = await payments.countDocuments({
      bondId: id,
      type: 'principal',
      status: 'paid',
    });
    if (pendingPrincipal === 0 && paidPrincipal > 0) {
      const r = await bonds.updateOne(
        { _id: id, status: { $ne: 'matured' } },
        { $set: { status: 'matured', availableUnits: 0 } },
      );
      matured += r.modifiedCount;
      await positions.updateMany({ bondId: id, units: { $gt: 0 } }, { $set: { units: 0 } });
    }
  }
  return { activated, paid, matured };
}
