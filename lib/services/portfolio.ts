import { ObjectId } from 'mongodb';
import { col } from '../db';
import { distribution, marketValueCents, valuePosition } from '../domain/valuation';
import { toISODate } from '../domain/dates';
import { sumCents } from '../money';
import type { BondDoc, IssuerDoc, PositionDoc, ScheduledPaymentDoc } from '../types';

export type Holding = PositionDoc & { bond: BondDoc; issuer: IssuerDoc };

export async function getHoldings(investorId: ObjectId): Promise<Holding[]> {
  return (await col('positions'))
    .aggregate<Holding>([
      { $match: { investorId, units: { $gt: 0 } } },
      { $lookup: { from: 'bonds', localField: 'bondId', foreignField: '_id', as: 'bond' } },
      { $unwind: '$bond' },
      { $lookup: { from: 'issuers', localField: 'bond.issuerId', foreignField: '_id', as: 'issuer' } },
      { $unwind: '$issuer' },
      { $sort: { acquiredAt: -1 } },
    ])
    .toArray();
}

export const priceOf = (b: BondDoc): number => b.marketPriceBps ?? b.finalPriceBps ?? 10_000;

export interface PerformancePoint {
  date: string;
  valueCents: number;
  collectedCents: number;
  totalCents: number;
}

/**
 * Rendimiento histórico: valor de mercado a cada fecha de priceHistory (con el último precio
 * conocido de cada bono) + pagos cobrados acumulados hasta esa fecha.
 */
export async function getPerformance(
  investorId: ObjectId,
  holdings: Holding[],
  paid: ScheduledPaymentDoc[],
): Promise<PerformancePoint[]> {
  if (holdings.length === 0) return [];
  const bondIds = holdings.map((h) => h.bondId);
  const history = await (await col('priceHistory')).find({ bondId: { $in: bondIds } }).sort({ date: 1 }).toArray();
  const dates = [...new Set(history.map((h) => toISODate(h.date)))].sort();
  const byBond = new Map<string, { date: string; priceBps: number }[]>();
  for (const h of history) {
    const k = h.bondId.toHexString();
    byBond.set(k, [...(byBond.get(k) ?? []), { date: toISODate(h.date), priceBps: h.priceBps }]);
  }
  return dates.map((date) => {
    const parts: number[] = [];
    for (const h of holdings) {
      if (toISODate(h.acquiredAt) > date) continue;
      const series = byBond.get(h.bondId.toHexString()) ?? [];
      const last = [...series].reverse().find((s) => s.date <= date);
      if (last) parts.push(marketValueCents(h.units, h.bond.nominalCents, last.priceBps));
    }
    const collected = sumCents(paid.filter((p) => p.paidAt && toISODate(p.paidAt) <= date).map((p) => p.amountCents));
    const value = sumCents(parts);
    return { date, valueCents: value, collectedCents: collected, totalCents: value + collected };
  });
}

export async function getPortfolio(investorId: ObjectId, asOf: Date = new Date()) {
  const holdings = await getHoldings(investorId);
  const payments = await (await col('scheduledPayments')).find({ investorId }).sort({ dueDate: 1 }).toArray();
  const paid = payments.filter((p) => p.status === 'paid');
  const upcoming = payments.filter((p) => p.status === 'scheduled' && p.dueDate >= startOf(asOf));
  const overdue = payments.filter((p) => p.status === 'scheduled' && p.dueDate < startOf(asOf));

  const rows = holdings.map((h) => ({
    holding: h,
    ...valuePosition({
      units: h.units,
      nominalCents: h.bond.nominalCents,
      priceBps: priceOf(h.bond),
      avgCostBps: h.avgCostBps,
    }),
  }));
  const marketValue = sumCents(rows.map((r) => r.marketValueCents));
  const cost = sumCents(rows.map((r) => r.costCents));
  const pnl = marketValue - cost;
  const dist = (keyOf: (h: Holding) => string) =>
    distribution(rows, (r) => keyOf(r.holding), (r) => r.marketValueCents);

  const upcomingWithBond = upcoming.slice(0, 12).map((p) => ({
    ...p,
    bond: holdings.find((h) => h.bondId.equals(p.bondId))?.bond,
  }));

  return {
    rows,
    marketValueCents: marketValue,
    costCents: cost,
    pnlCents: pnl,
    collectedCents: sumCents(paid.map((p) => p.amountCents)),
    upcomingCents: sumCents(upcoming.map((p) => p.amountCents)),
    overdueCount: overdue.length,
    upcoming: upcomingWithBond,
    byRating: dist((h) => h.issuer.rating),
    bySector: dist((h) => h.issuer.sector),
    byTerm: dist((h) => h.bond.term),
    performance: await getPerformance(investorId, holdings, paid),
  };
}

const startOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
