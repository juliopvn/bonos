import { describe, expect, it } from 'vitest';
import {
  addCents, applyBps, divRound, formatMoney, mulDiv, parseMoneyToCents, roundHalfEven, sumCents, MoneyError,
} from '@/lib/money';
import { formatBps, formatPrice, percentToBps } from '@/lib/bps';

describe('mulDiv / divRound (half-even)', () => {
  it('redondea .5 al par más cercano', () => {
    expect(divRound(5, 2)).toBe(2);
    expect(divRound(7, 2)).toBe(4);
    expect(divRound(-5, 2)).toBe(-2);
    expect(divRound(-7, 2)).toBe(-4);
  });
  it('redondea normalmente fuera de .5', () => {
    expect(divRound(10, 3)).toBe(3);
    expect(divRound(11, 3)).toBe(4);
    expect(divRound(-10, 3)).toBe(-3);
    expect(divRound(1, 3)).toBe(0);
  });
  it('maneja divisor negativo', () => {
    expect(divRound(10, -4)).toBe(-2);
    expect(divRound(-10, -4)).toBe(2);
  });
  it('no pierde precisión con productos grandes', () => {
    expect(mulDiv(10_000_000_000, 9_999_999, 10_000)).toBe(9_999_999_000_000);
    expect(mulDiv(123_456_789_012, 3, 7)).toBe(52_910_052_434);
  });
  it('rechaza decimales y división entre cero', () => {
    expect(() => mulDiv(1.5, 1, 1)).toThrow(MoneyError);
    expect(() => divRound(1, 0)).toThrow('División entre cero');
  });
});

describe('utilidades', () => {
  it('roundHalfEven numérico', () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(2.4999)).toBe(2);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(() => roundHalfEven(NaN)).toThrow();
  });
  it('suma y aplica bps', () => {
    expect(addCents(100, 250, -50)).toBe(300);
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(applyBps(100_000, 525)).toBe(5_250);
    expect(() => addCents(0.1)).toThrow();
  });
  it('formatea moneda es-MX', () => {
    expect(formatMoney(123_456)).toMatch(/1,234\.56/);
    expect(formatMoney(-5)).toMatch(/-.*0\.05/);
    expect(formatMoney(100_000_000_00)).toMatch(/100,000,000\.00/);
  });
  it('parsea importes sin coma flotante', () => {
    expect(parseMoneyToCents('1,234.56')).toBe(123_456);
    expect(parseMoneyToCents('10')).toBe(1_000);
    expect(parseMoneyToCents('0.1')).toBe(10);
    expect(parseMoneyToCents('-3.05')).toBe(-305);
    expect(() => parseMoneyToCents('1.234')).toThrow(MoneyError);
    expect(() => parseMoneyToCents('abc')).toThrow(MoneyError);
  });
  it('formatea y parsea bps', () => {
    expect(formatBps(525)).toBe('5.25%');
    expect(formatBps(-5)).toBe('-0.05%');
    expect(formatBps(600, 0)).toBe('6.00%'.replace('.00', ''));
    expect(formatPrice(9850)).toBe('98.50');
    expect(percentToBps('5.25')).toBe(525);
    expect(percentToBps('6%')).toBe(600);
    expect(percentToBps('0,5')).toBe(50);
    expect(percentToBps('-1.5')).toBe(-150);
    expect(() => percentToBps('5.255')).toThrow(MoneyError);
  });
});
