import { describe, expect, it } from 'vitest';
import { aggregateDemand, allocate, type BookOrder } from '@/lib/domain/bookbuilding';
import { distribution, marketValueCents, valuePortfolio, valuePosition } from '@/lib/domain/valuation';
import { concentrationBreaches, dedupe, exceedsPriceMove, priceMoveBps } from '@/lib/domain/alerts';

const o = (id: string, units: number, limitPriceBps: number, t: number): BookOrder => ({
  id, units, limitPriceBps, createdAt: new Date(2025, 0, 1, 0, 0, t),
});

describe('aggregateDemand', () => {
  it('agrupa por precio con acumulado y cobertura', () => {
    const d = aggregateDemand([o('a', 60, 10_050, 1), o('b', 50, 10_000, 2), o('c', 40, 9_900, 3), o('d', 10, 10_000, 4)], 100);
    expect(d.levels).toEqual([
      { priceBps: 10_050, units: 60, orders: 1, cumulativeUnits: 60 },
      { priceBps: 10_000, units: 60, orders: 2, cumulativeUnits: 120 },
      { priceBps: 9_900, units: 40, orders: 1, cumulativeUnits: 160 },
    ]);
    expect(d.totalUnits).toBe(160);
    expect(d.orderCount).toBe(4);
    expect(d.coverageX100).toBe(160);
  });
  it('libro vacío', () => {
    expect(aggregateDemand([], 100)).toEqual({ levels: [], totalUnits: 0, orderCount: 0, coverageX100: 0 });
    expect(aggregateDemand([], 0).coverageX100).toBe(0);
  });
});

describe('allocate', () => {
  it('sobresuscripción: prorrateo hacia abajo + residuo por orden de llegada', () => {
    const r = allocate([o('a', 60, 10_050, 1), o('b', 50, 10_000, 2), o('c', 40, 9_900, 3)], 10_000, 100);
    // elegibles a,b (110): floor(60×100/110)=54, floor(50×100/110)=45 → residuo 1 → a
    expect(r).toEqual([
      { id: 'a', allocatedUnits: 55, status: 'partial' },
      { id: 'b', allocatedUnits: 45, status: 'partial' },
      { id: 'c', allocatedUnits: 0, status: 'rejected' },
    ]);
  });
  it('residuo repartido en orden de llegada, no de lista', () => {
    const r = allocate([o('z', 10, 10_000, 3), o('y', 10, 10_000, 1), o('x', 10, 10_000, 2)], 10_000, 10);
    const by = Object.fromEntries(r.map((x) => [x.id, x.allocatedUnits]));
    expect(by).toEqual({ y: 4, x: 3, z: 3 });
    expect(Object.values(by).reduce((s, n) => s + n, 0)).toBe(10);
  });
  it('infrasuscripción: adjudica todo lo elegible', () => {
    const r = allocate([o('a', 30, 10_000, 1), o('b', 20, 9_000, 2)], 10_000, 100);
    expect(r).toEqual([
      { id: 'a', allocatedUnits: 30, status: 'allocated' },
      { id: 'b', allocatedUnits: 0, status: 'rejected' },
    ]);
  });
  it('invariante: Σ adjudicado = min(oferta, demanda elegible)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const orders = Array.from({ length: 1 + (seed % 7) }, (_, i) => o(`o${i}`, 1 + ((seed * (i + 3)) % 40), 9_900 + ((seed + i) % 3) * 50, i));
      const final = 9_950;
      const offered = 10 + (seed % 60);
      const eligible = orders.filter((x) => x.limitPriceBps >= final).reduce((s, x) => s + x.units, 0);
      const total = allocate(orders, final, offered).reduce((s, x) => s + x.allocatedUnits, 0);
      expect(total).toBe(Math.min(offered, eligible));
    }
  });
  it('nunca adjudica más de lo solicitado', () => {
    const orders = [o('a', 1, 10_000, 1), o('b', 100, 10_000, 2)];
    const r = allocate(orders, 10_000, 50);
    expect(r[0].allocatedUnits).toBeLessThanOrEqual(1);
    expect(r.reduce((s, x) => s + x.allocatedUnits, 0)).toBe(50);
  });
});

describe('valuation', () => {
  it('valor de mercado = títulos × nominal × precio', () => {
    expect(marketValueCents(10, 100_000, 9_850)).toBe(985_000);
  });
  it('P&L vs costo', () => {
    const v = valuePosition({ units: 10, nominalCents: 100_000, priceBps: 10_200, avgCostBps: 10_000 });
    expect(v).toEqual({ marketValueCents: 1_020_000, costCents: 1_000_000, pnlCents: 20_000, pnlBps: 200 });
    expect(valuePosition({ units: 1, nominalCents: 100, priceBps: 100, avgCostBps: 0 }).pnlBps).toBe(0);
  });
  it('cartera y distribución', () => {
    const p = valuePortfolio([
      { units: 10, nominalCents: 100_000, priceBps: 10_000, avgCostBps: 9_900 },
      { units: 5, nominalCents: 100_000, priceBps: 9_000, avgCostBps: 9_500 },
    ]);
    expect(p.marketValueCents).toBe(1_450_000);
    expect(p.costCents).toBe(1_465_000);
    expect(p.pnlCents).toBe(-15_000);
    expect(valuePortfolio([]).pnlBps).toBe(0);
    const d = distribution([{ k: 'A', v: 300 }, { k: 'B', v: 100 }, { k: 'A', v: 100 }], (x) => x.k, (x) => x.v);
    expect(d).toEqual([{ key: 'A', valueCents: 400, shareBps: 8000 }, { key: 'B', valueCents: 100, shareBps: 2000 }]);
    expect(distribution([], () => '', () => 0)).toEqual([]);
  });
});

describe('alerts (dominio)', () => {
  it('umbral de variación de precio', () => {
    expect(priceMoveBps(9_800, 10_000)).toBe(200);
    expect(exceedsPriceMove(9_800, 10_000, 200)).toBe(true);
    expect(exceedsPriceMove(9_900, 10_000, 200)).toBe(false);
  });
  it('concentración por encima del umbral', () => {
    const items = [
      { valueCents: 600, keys: { issuer: 'X', sector: 'energia' } },
      { valueCents: 200, keys: { issuer: 'Y', sector: 'energia' } },
      { valueCents: 200, keys: { issuer: 'Z', sector: 'banca' } },
    ];
    expect(concentrationBreaches(items, 30)).toEqual([
      { dimension: 'sector', key: 'energia', shareBps: 8000 },
      { dimension: 'issuer', key: 'X', shareBps: 6000 },
    ]);
    expect(concentrationBreaches(items, 90)).toEqual([]);
    expect(concentrationBreaches([], 30)).toEqual([]);
  });
  it('claves de deduplicación estables', () => {
    expect(dedupe.rating('i1', 'AA', '2025-01-01')).toBe('rating:i1:AA:2025-01-01');
    expect(dedupe.price('b1', '2025-01-01')).toBe('price:b1:2025-01-01');
    expect(dedupe.rebalance('sector', 'x', '2025-01-01')).toBe('rebalance:sector:x:2025-01-01');
    expect(dedupe.payment('p1')).toBe('payment:p1');
  });
});
