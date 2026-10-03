import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { audit } from '../audit';
import { col } from '../db';
import { deriveTerm } from '../domain/term';
import {
  effectiveRateBps,
  flowsForUnits,
  generateSchedule,
  type ScheduleFlow,
} from '../domain/schedule';
import { ytmFromPrice } from '../domain/ytm';
import { startOfUtcDay, toISODate } from '../domain/dates';
import { conflict, badRequest } from '../http';
import { getBond } from '../repositories/bonds';
import { getIssuer } from '../repositories/issuers';
import type { BondDoc } from '../types';
import type { bondSchema, previewSchema } from '../validation';
import { evaluatePriceMoves } from './alerts';

type BondInput = z.output<typeof bondSchema>;
type PreviewInput = z.output<typeof previewSchema>;

export function previewSchedule(input: PreviewInput): ScheduleFlow[] {
  return generateSchedule({
    nominalCents: input.nominalCents,
    annualRateBps: effectiveRateBps({
      couponType: input.couponType,
      couponRateBps: input.couponRateBps ?? null,
      referenceRateBps: input.referenceRateBps ?? null,
      spreadBps: input.spreadBps ?? null,
    }),
    frequency: input.frequency,
    dayCount: input.dayCount,
    issueDate: input.issueDate,
    maturityDate: input.maturityDate,
  });
}

/** Flujos por título del bono con su tasa vigente. */
export function bondFlows(bond: BondDoc): ScheduleFlow[] {
  return generateSchedule({
    nominalCents: bond.nominalCents,
    annualRateBps: effectiveRateBps(bond),
    frequency: bond.frequency,
    dayCount: bond.dayCount,
    issueDate: bond.issueDate,
    maturityDate: bond.maturityDate,
  });
}

export function computeYtm(bond: BondDoc, priceBps: number, settle: Date): number | null {
  return ytmFromPrice(bondFlows(bond), bond.nominalCents, priceBps, settle, bond.frequency);
}

export async function createBond(actorId: ObjectId, input: BondInput): Promise<BondDoc> {
  await getIssuer(input.issuerId);
  const rate = effectiveRateBps({
    couponType: input.couponType,
    couponRateBps: input.couponRateBps ?? null,
    referenceRateBps: input.referenceRateBps ?? null,
    spreadBps: input.spreadBps ?? null,
  });
  const doc: BondDoc = {
    _id: new ObjectId(),
    issuerId: input.issuerId,
    name: input.name,
    code: input.code,
    nominalCents: input.nominalCents,
    couponType: input.couponType,
    couponRateBps: input.couponType === 'fixed' ? (input.couponRateBps ?? null) : null,
    referenceRateBps: input.couponType === 'floating' ? (input.referenceRateBps ?? null) : null,
    spreadBps: input.couponType === 'floating' ? (input.spreadBps ?? null) : null,
    frequency: input.frequency,
    dayCount: input.dayCount,
    issueDate: input.issueDate,
    maturityDate: input.maturityDate,
    term: deriveTerm(input.issueDate, input.maturityDate),
    status: 'draft',
    totalUnits: input.totalUnits,
    availableUnits: 0,
    finalPriceBps: null,
    marketPriceBps: 10_000, // precio indicativo: a la par
    ytmBps: rate, // a la par, YTM = cupón
    createdAt: new Date(),
  };
  try {
    await (await col('bonds')).insertOne(doc);
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw conflict('Ya existe una emisión con ese código');
    throw e;
  }
  await audit(actorId, 'bond.create', 'bond', doc._id, { code: doc.code, status: 'draft' });
  return doc;
}

export async function openBookbuilding(actorId: ObjectId, bondId: ObjectId): Promise<BondDoc> {
  const res = await (
    await col('bonds')
  ).findOneAndUpdate(
    { _id: bondId, status: 'draft' },
    { $set: { status: 'bookbuilding' } },
    { returnDocument: 'after' },
  );
  if (!res) {
    await getBond(bondId); // 404 si no existe
    throw conflict('Solo una emisión en borrador puede abrir el bookbuilding');
  }
  await audit(actorId, 'bond.open_bookbuilding', 'bond', bondId, {
    from: 'draft',
    to: 'bookbuilding',
  });
  return res;
}

/**
 * Actualiza la tasa de referencia de un bono variable y recalcula los cupones futuros no pagados
 * (los ya pagados no cambian).
 */
export async function updateReferenceRate(
  actorId: ObjectId,
  bondId: ObjectId,
  referenceRateBps: number,
): Promise<{ bond: BondDoc; recalculated: number }> {
  const bonds = await col('bonds');
  const bond = await getBond(bondId);
  if (bond.couponType !== 'floating')
    throw badRequest('Solo los bonos de tasa variable tienen tasa de referencia');
  if (bond.status === 'matured') throw conflict('El bono ya venció');

  const updated = await bonds.findOneAndUpdate(
    { _id: bondId },
    { $set: { referenceRateBps } },
    { returnDocument: 'after' },
  );
  const next = updated!;
  const unitByDate = new Map(
    bondFlows(next)
      .filter((f) => f.type === 'coupon')
      .map((f) => [toISODate(f.dueDate), f.amountCents]),
  );

  const positions = await (await col('positions')).find({ bondId, units: { $gt: 0 } }).toArray();
  const payments = await col('scheduledPayments');
  let recalculated = 0;
  for (const pos of positions) {
    const pending = await payments
      .find({ bondId, investorId: pos.investorId, type: 'coupon', status: 'scheduled' })
      .toArray();
    for (const p of pending) {
      const unit = unitByDate.get(toISODate(p.dueDate));
      if (unit === undefined) continue;
      const amountCents = unit * pos.units;
      if (amountCents !== p.amountCents) {
        await payments.updateOne({ _id: p._id, status: 'scheduled' }, { $set: { amountCents } });
        recalculated++;
      }
    }
  }
  await audit(actorId, 'bond.reference_rate', 'bond', bondId, {
    from: bond.referenceRateBps,
    to: referenceRateBps,
    recalculated,
  });
  return { bond: next, recalculated };
}

/** Simulación de mercado: fija el precio, recalcula YTM, alimenta priceHistory y evalúa alertas. */
export async function updateMarketPrice(
  actorId: ObjectId,
  bondId: ObjectId,
  priceBps: number,
  asOf: Date = new Date(),
): Promise<BondDoc> {
  const bond = await getBond(bondId);
  if (bond.status !== 'active' && bond.status !== 'allocated') {
    throw conflict('Solo se puede actualizar el precio de bonos adjudicados o vigentes');
  }
  const date = startOfUtcDay(asOf);
  const ytmBps = computeYtm(bond, priceBps, date);
  if (ytmBps === null) throw badRequest('No se pudo calcular el rendimiento con ese precio');

  const history = await col('priceHistory');
  await history.updateOne({ bondId, date }, { $set: { priceBps, ytmBps } }, { upsert: true });
  const updated = await (
    await col('bonds')
  ).findOneAndUpdate(
    { _id: bondId },
    { $set: { marketPriceBps: priceBps, ytmBps } },
    { returnDocument: 'after' },
  );
  await audit(actorId, 'bond.market_price', 'bond', bondId, {
    from: bond.marketPriceBps,
    to: priceBps,
    ytmBps,
  });
  await evaluatePriceMoves(date, bondId);
  return updated!;
}

export { flowsForUnits };
