import { mulDiv, sumCents } from '../money';

export interface HeldPosition {
  units: number;
  nominalCents: number;
  priceBps: number;
  avgCostBps: number;
}

/** Valor de mercado = títulos × nominal × precio / 10000. */
export const marketValueCents = (units: number, nominalCents: number, priceBps: number): number =>
  mulDiv(units * nominalCents, priceBps, 10_000);

export const costCents = (units: number, nominalCents: number, avgCostBps: number): number =>
  marketValueCents(units, nominalCents, avgCostBps);

export function valuePosition(p: HeldPosition) {
  const marketValue = marketValueCents(p.units, p.nominalCents, p.priceBps);
  const cost = costCents(p.units, p.nominalCents, p.avgCostBps);
  const pnl = marketValue - cost;
  return { marketValueCents: marketValue, costCents: cost, pnlCents: pnl, pnlBps: cost === 0 ? 0 : mulDiv(pnl, 10_000, cost) };
}

export function valuePortfolio(positions: readonly HeldPosition[]) {
  const items = positions.map(valuePosition);
  const marketValue = sumCents(items.map((i) => i.marketValueCents));
  const cost = sumCents(items.map((i) => i.costCents));
  const pnl = marketValue - cost;
  return {
    items,
    marketValueCents: marketValue,
    costCents: cost,
    pnlCents: pnl,
    pnlBps: cost === 0 ? 0 : mulDiv(pnl, 10_000, cost),
  };
}

export interface Slice {
  key: string;
  valueCents: number;
  shareBps: number;
}

/** Reparto del valor por una dimensión (rating, sector, plazo…), ordenado de mayor a menor. */
export function distribution<T>(items: readonly T[], keyOf: (i: T) => string, valueOf: (i: T) => number): Slice[] {
  const totals = new Map<string, number>();
  for (const it of items) totals.set(keyOf(it), (totals.get(keyOf(it)) ?? 0) + valueOf(it));
  const total = sumCents([...totals.values()]);
  return [...totals.entries()]
    .map(([key, valueCents]) => ({ key, valueCents, shareBps: total === 0 ? 0 : mulDiv(valueCents, 10_000, total) }))
    .sort((a, b) => b.valueCents - a.valueCents || a.key.localeCompare(b.key));
}
