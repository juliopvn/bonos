import { MoneyError } from './money';

/** Puntos básicos (bps): 1 bp = 0,01 %. 10000 bps = 100 %. */

/** Formatea bps como porcentaje (525 → "5.25%"). */
export function formatBps(bps: number, digits = 2): string {
  const sign = bps < 0 ? '-' : '';
  const abs = Math.abs(bps);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const text = digits >= 2 ? `${whole}.${frac}` : `${whole}.${frac}`.replace(/0+$/, '').replace(/\.$/, '');
  return `${sign}${text}%`;
}

/** Precio en bps del nominal → "98.50" (sin símbolo %). */
export function formatPrice(priceBps: number): string {
  return formatBps(priceBps).replace('%', '');
}

/** "5.25" → 525. Sin coma flotante; admite hasta 2 decimales. */
export function percentToBps(input: string): number {
  const clean = input.trim().replace('%', '').replace(',', '.');
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) throw new MoneyError(`Porcentaje inválido: "${input}"`);
  const bps = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -bps : bps;
}
