import { describe, expect, it } from 'vitest';
import { generateSchedule } from '@/lib/domain/schedule';
import { priceFromYtm, ytmFromPrice } from '@/lib/domain/ytm';
import { parseISODate as d } from '@/lib/domain/dates';

const nominal = 100_000;
const mk = (rate: number, freq: 1 | 2 | 4 | 12, from: string, to: string) =>
  generateSchedule({
    nominalCents: nominal,
    annualRateBps: rate,
    frequency: freq,
    dayCount: '30/360',
    issueDate: d(from),
    maturityDate: d(to),
  });

describe('YTM', () => {
  it('a la par, YTM = cupón (semestral)', () => {
    const f = mk(600, 2, '2025-01-15', '2030-01-15');
    expect(ytmFromPrice(f, nominal, 10_000, d('2025-01-15'), 2)).toBe(600);
  });
  it('a la par, YTM = cupón (trimestral, 8.25%)', () => {
    const f = mk(825, 4, '2025-01-15', '2028-01-15');
    expect(ytmFromPrice(f, nominal, 10_000, d('2025-01-15'), 4)).toBe(825);
  });
  it('cálculo a mano: anual 5%, 1 año, precio 98 → 105/98 − 1 = 7.14%', () => {
    const f = mk(500, 1, '2025-01-15', '2026-01-15');
    expect(ytmFromPrice(f, nominal, 9_800, d('2025-01-15'), 1)).toBe(714);
  });
  it('precio < par ⇒ YTM > cupón; precio > par ⇒ YTM < cupón', () => {
    const f = mk(600, 2, '2025-01-15', '2030-01-15');
    expect(ytmFromPrice(f, nominal, 9_500, d('2025-01-15'), 2)!).toBeGreaterThan(600);
    expect(ytmFromPrice(f, nominal, 10_500, d('2025-01-15'), 2)!).toBeLessThan(600);
  });
  it('ida y vuelta precio ↔ YTM', () => {
    const f = mk(700, 2, '2025-01-15', '2032-01-15');
    for (const p of [8_800, 9_500, 10_000, 10_400]) {
      const y = ytmFromPrice(f, nominal, p, d('2025-01-15'), 2)!;
      expect(Math.abs(priceFromYtm(f, nominal, y, d('2025-01-15'), 2) - p)).toBeLessThanOrEqual(5);
    }
  });
  it('bono con descuento muy profundo converge (bisección de respaldo si hace falta)', () => {
    const f = mk(100, 1, '2025-01-15', '2045-01-15');
    const y = ytmFromPrice(f, nominal, 2_000, d('2025-01-15'), 1)!;
    expect(y).toBeGreaterThan(700);
  });
  it('sin flujos futuros o precio inválido → null', () => {
    const f = mk(600, 2, '2025-01-15', '2026-01-15');
    expect(ytmFromPrice(f, nominal, 10_000, d('2027-01-01'), 2)).toBeNull();
    expect(ytmFromPrice(f, nominal, 0, d('2025-01-15'), 2)).toBeNull();
  });
  it('precio inalcanzable → null', () => {
    const f = mk(600, 1, '2025-01-15', '2026-01-15');
    expect(ytmFromPrice(f, nominal, 90_000_000, d('2025-01-15'), 1)).toBeNull();
  });
});
