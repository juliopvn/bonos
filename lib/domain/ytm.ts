import { roundHalfEven } from '../money';
import type { Frequency } from '../types';
import { days360 } from './dates';

export interface CashFlow {
  dueDate: Date;
  amountCents: number;
}

const MAX_ITER = 100;
const TOLERANCE = 1e-10;

/** Fracción de año 30/360 desde la liquidación. */
const yearFrac = (settle: Date, due: Date) => days360(settle, due) / 360;

function presentValue(flows: readonly CashFlow[], settle: Date, y: number, f: number): number {
  let pv = 0;
  for (const fl of flows) {
    const t = yearFrac(settle, fl.dueDate);
    if (t < 0) continue;
    pv += fl.amountCents / Math.pow(1 + y / f, f * t);
  }
  return pv;
}

function derivative(flows: readonly CashFlow[], settle: Date, y: number, f: number): number {
  let d = 0;
  for (const fl of flows) {
    const t = yearFrac(settle, fl.dueDate);
    if (t < 0) continue;
    d += (-t * fl.amountCents) / Math.pow(1 + y / f, f * t + 1);
  }
  return d;
}

/** Precio (bps del nominal) para un YTM dado (bps), compuesto con la frecuencia del bono. */
export function priceFromYtm(
  flows: readonly CashFlow[],
  nominalCents: number,
  ytmBps: number,
  settle: Date,
  frequency: Frequency,
): number {
  const pv = presentValue(flows, settle, ytmBps / 10_000, frequency);
  return roundHalfEven((pv / nominalCents) * 10_000);
}

/**
 * YTM (bps) a partir del precio (bps del nominal) con Newton-Raphson.
 * Si Newton no converge, recurre a bisección. Devuelve null si no hay flujos futuros.
 */
export function ytmFromPrice(
  flows: readonly CashFlow[],
  nominalCents: number,
  priceBps: number,
  settle: Date,
  frequency: Frequency,
): number | null {
  const future = flows.filter((f) => f.dueDate > settle);
  if (future.length === 0 || priceBps <= 0) return null;
  const target = (priceBps / 10_000) * nominalCents;
  const f = frequency;
  const g = (y: number) => presentValue(future, settle, y, f) - target;

  const lowerBound = -f + 1e-6; // (1 + y/f) > 0
  let y = 0.05;
  for (let i = 0; i < MAX_ITER; i++) {
    const err = g(y);
    if (Math.abs(err) / nominalCents < TOLERANCE) return plausible(y);
    const slope = derivative(future, settle, y, f);
    if (slope === 0 || !Number.isFinite(slope)) break;
    let next = y - err / slope;
    if (next <= lowerBound) next = (y + lowerBound) / 2;
    if (!Number.isFinite(next)) break;
    y = next;
  }

  // Bisección de respaldo: g es decreciente en y.
  let lo = lowerBound;
  let hi = 10;
  if (g(lo) < 0 || g(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return plausible((lo + hi) / 2);
}

/** Descarta rendimientos absurdos (< −50 %) que indican un precio inalcanzable. */
function plausible(y: number): number | null {
  return y < -0.5 ? null : roundHalfEven(y * 10_000);
}
