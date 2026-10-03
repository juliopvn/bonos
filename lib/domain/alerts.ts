import { mulDiv } from '../money';

/** Variación absoluta de precio en bps del nominal (9800 → 10000 = 200). */
export const priceMoveBps = (prevBps: number, currBps: number): number =>
  Math.abs(currBps - prevBps);

export const exceedsPriceMove = (prevBps: number, currBps: number, thresholdBps: number): boolean =>
  priceMoveBps(prevBps, currBps) >= thresholdBps;

export interface ConcentrationBreach {
  dimension: string;
  key: string;
  shareBps: number;
}

/**
 * Concentraciones por encima del umbral (pct entero, p. ej. 30) para cada dimensión.
 * `items` trae el valor de mercado y las claves por dimensión.
 */
export function concentrationBreaches(
  items: readonly { valueCents: number; keys: Record<string, string> }[],
  thresholdPct: number,
): ConcentrationBreach[] {
  const total = items.reduce((s, i) => s + i.valueCents, 0);
  if (total <= 0) return [];
  const acc = new Map<string, number>();
  for (const it of items) {
    for (const [dimension, key] of Object.entries(it.keys)) {
      const k = `${dimension}\u0000${key}`;
      acc.set(k, (acc.get(k) ?? 0) + it.valueCents);
    }
  }
  const out: ConcentrationBreach[] = [];
  for (const [k, value] of acc) {
    const shareBps = mulDiv(value, 10_000, total);
    if (shareBps > thresholdPct * 100) {
      const [dimension, key] = k.split('\u0000');
      out.push({ dimension, key, shareBps });
    }
  }
  return out.sort((a, b) => b.shareBps - a.shareBps || a.dimension.localeCompare(b.dimension));
}

/** Claves de deduplicación: una alerta por hecho, no por ejecución del job. */
export const dedupe = {
  rating: (issuerId: string, rating: string, isoDate: string) =>
    `rating:${issuerId}:${rating}:${isoDate}`,
  price: (bondId: string, isoDate: string) => `price:${bondId}:${isoDate}`,
  rebalance: (dimension: string, key: string, isoDate: string) =>
    `rebalance:${dimension}:${key}:${isoDate}`,
  payment: (paymentId: string) => `payment:${paymentId}`,
};
