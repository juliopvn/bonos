import { describe, expect, it } from 'vitest';
import { couponDates, effectiveRateBps, flowsForUnits, generateSchedule } from '@/lib/domain/schedule';
import { deriveTerm } from '@/lib/domain/term';
import { addMonths, days360, parseISODate as d, toISODate } from '@/lib/domain/dates';
import { isInvestmentGrade, ratingRank, ratingsBetween } from '@/lib/domain/rating';

const base = { nominalCents: 100_000, annualRateBps: 600, frequency: 2 as const, dayCount: '30/360' as const };

describe('generateSchedule', () => {
  it('cupón fijo semestral: 4 cupones de 30.00 + principal', () => {
    const f = generateSchedule({ ...base, issueDate: d('2025-01-15'), maturityDate: d('2027-01-15') });
    expect(f.map((x) => toISODate(x.dueDate))).toEqual([
      '2025-07-15', '2026-01-15', '2026-07-15', '2027-01-15', '2027-01-15',
    ]);
    expect(f.filter((x) => x.type === 'coupon').map((x) => x.amountCents)).toEqual([3000, 3000, 3000, 3000]);
    expect(f.at(-1)).toMatchObject({ type: 'principal', amountCents: 100_000 });
  });

  it('cupón variable trimestral (referencia 11.00% + spread 2.50% = 13.50%)', () => {
    const rate = effectiveRateBps({ couponType: 'floating', couponRateBps: null, referenceRateBps: 1100, spreadBps: 250 });
    expect(rate).toBe(1350);
    const f = generateSchedule({ ...base, annualRateBps: rate, frequency: 4, issueDate: d('2025-03-01'), maturityDate: d('2026-03-01') });
    expect(f.filter((x) => x.type === 'coupon')).toHaveLength(4);
    expect(f.filter((x) => x.type === 'coupon').every((x) => x.amountCents === 3375)).toBe(true);
  });

  it('primer cupón irregular (stub) con 30/360', () => {
    const f = generateSchedule({ ...base, issueDate: d('2025-02-10'), maturityDate: d('2026-01-15') });
    const coupons = f.filter((x) => x.type === 'coupon');
    expect(days360(d('2025-02-10'), d('2025-07-15'))).toBe(155);
    expect(coupons.map((x) => x.amountCents)).toEqual([2583, 3000]); // 100000×6%×155/360 = 2583.33
  });

  it('fin de mes: se conserva el último día de cada periodo', () => {
    const dates = couponDates(d('2025-02-28'), d('2026-02-28'), 2);
    expect(dates.map(toISODate)).toEqual(['2025-08-31', '2026-02-28']);
    const f = generateSchedule({ ...base, issueDate: d('2025-02-28'), maturityDate: d('2026-02-28') });
    expect(f.filter((x) => x.type === 'coupon').map((x) => x.amountCents)).toEqual([3000, 3000]);
  });

  it('ACT/365 usa días reales', () => {
    const f = generateSchedule({ ...base, dayCount: 'ACT/365', issueDate: d('2025-01-15'), maturityDate: d('2026-01-15') });
    expect(f[0].amountCents).toBe(2975); // 100000×6%×181/365 = 2975.34
  });

  it('ACT/360 usa días reales', () => {
    const f = generateSchedule({ ...base, dayCount: 'ACT/360', issueDate: d('2025-01-15'), maturityDate: d('2026-01-15') });
    expect(f[0].amountCents).toBe(3017); // ×181/360 = 3016.67
  });

  it('mensual y anual', () => {
    expect(generateSchedule({ ...base, frequency: 12, issueDate: d('2025-01-31'), maturityDate: d('2025-07-31') }).filter((x) => x.type === 'coupon')).toHaveLength(6);
    expect(generateSchedule({ ...base, frequency: 1, issueDate: d('2025-01-01'), maturityDate: d('2030-01-01') }).filter((x) => x.type === 'coupon')).toHaveLength(5);
  });

  it('valida entradas', () => {
    expect(() => generateSchedule({ ...base, issueDate: d('2026-01-01'), maturityDate: d('2025-01-01') })).toThrow();
    expect(() => generateSchedule({ ...base, nominalCents: 0, issueDate: d('2025-01-01'), maturityDate: d('2026-01-01') })).toThrow();
    expect(() => generateSchedule({ ...base, annualRateBps: -1, issueDate: d('2025-01-01'), maturityDate: d('2026-01-01') })).toThrow();
  });

  it('flowsForUnits multiplica por títulos y filtra por fecha', () => {
    const f = generateSchedule({ ...base, issueDate: d('2025-01-15'), maturityDate: d('2026-01-15') });
    const mine = flowsForUnits(f, 10, d('2025-07-15'));
    expect(mine.map((x) => x.type)).toEqual(['coupon', 'principal']);
    expect(mine[0].amountCents).toBe(30_000);
    expect(flowsForUnits(f, 2)).toHaveLength(3);
  });

  it('tasa fija efectiva', () => {
    expect(effectiveRateBps({ couponType: 'fixed', couponRateBps: 725, referenceRateBps: null, spreadBps: null })).toBe(725);
  });
});

describe('plazo y fechas', () => {
  it('deriva corto/medio/largo', () => {
    expect(deriveTerm(d('2025-01-01'), d('2026-01-01'))).toBe('short');
    expect(deriveTerm(d('2025-01-01'), d('2026-01-02'))).toBe('medium');
    expect(deriveTerm(d('2025-01-01'), d('2030-01-01'))).toBe('medium');
    expect(deriveTerm(d('2025-01-01'), d('2030-01-02'))).toBe('long');
    expect(() => deriveTerm(d('2025-01-01'), d('2025-01-01'))).toThrow();
  });
  it('addMonths respeta fin de mes', () => {
    expect(toISODate(addMonths(d('2025-01-31'), 1))).toBe('2025-02-28');
    expect(toISODate(addMonths(d('2025-02-28'), 6, true))).toBe('2025-08-31');
    expect(toISODate(addMonths(d('2025-01-15'), -2))).toBe('2024-11-15');
  });
  it('parseISODate rechaza fechas inválidas', () => {
    expect(() => d('2025-02-30')).toThrow();
    expect(() => d('25-01-01')).toThrow();
  });
});

describe('rating', () => {
  it('ordena la escala', () => {
    expect(ratingRank('AAA')).toBeLessThan(ratingRank('BB'));
    expect(isInvestmentGrade('BBB-')).toBe(true);
    expect(isInvestmentGrade('BB+')).toBe(false);
    expect(ratingsBetween('A+', 'A-')).toEqual(['A+', 'A', 'A-']);
    expect(ratingsBetween('A-', 'A+')).toEqual(['A+', 'A', 'A-']);
    expect(() => ratingRank('ZZ')).toThrow();
  });
});
