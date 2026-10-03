/**
 * Aritmética monetaria entera. Importes en céntimos (enteros).
 * Toda división del dominio pasa por `mulDiv` / `divRound` (redondeo half-even, "del banquero").
 */

export class MoneyError extends Error {}

function assertSafeInt(n: number, label: string): void {
  if (!Number.isSafeInteger(n))
    throw new MoneyError(`${label} debe ser un entero seguro (recibido ${n})`);
}

/** round(a × b / c) con redondeo half-even. Usa BigInt internamente: sin pérdida de precisión. */
export function mulDiv(a: number, b: number, c: number): number {
  assertSafeInt(a, 'a');
  assertSafeInt(b, 'b');
  assertSafeInt(c, 'c');
  if (c === 0) throw new MoneyError('División entre cero');
  let num = BigInt(a) * BigInt(b);
  let den = BigInt(c);
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  let q = num / den; // trunca hacia cero
  let r = num % den;
  if (r < 0n) {
    // normaliza a floor para razonar con resto positivo
    q -= 1n;
    r += den;
  }
  const twice = r * 2n;
  if (twice > den || (twice === den && q % 2n !== 0n)) q += 1n;
  return Number(q);
}

/** round(n / d) con redondeo half-even. */
export function divRound(n: number, d: number): number {
  return mulDiv(n, 1, d);
}

/** Redondeo half-even de un número finito (para resultados numéricos como YTM). */
export function roundHalfEven(x: number): number {
  if (!Number.isFinite(x)) throw new MoneyError('Valor no finito');
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

export const addCents = (...values: number[]): number =>
  values.reduce((acc, v) => {
    assertSafeInt(v, 'importe');
    return acc + v;
  }, 0);

export const sumCents = (values: readonly number[]): number => addCents(...values);

/** Aplica una tasa/precio en bps a un importe. */
export function applyBps(cents: number, bps: number): number {
  return mulDiv(cents, bps, 10_000);
}

const currencyFormatter = (currency: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2 });

/** Formato de moneda (es-MX) a partir de céntimos. Solo para presentación. */
export function formatMoney(cents: number, currency = 'MXN'): string {
  assertSafeInt(cents, 'importe');
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  // El decimal se construye con enteros para no introducir error de coma flotante.
  return currencyFormatter(currency).format(
    sign * Number(`${whole}.${String(frac).padStart(2, '0')}`),
  );
}

/** Convierte "1234.56" / "1,234.56" a céntimos sin pasar por coma flotante. */
export function parseMoneyToCents(input: string): number {
  const clean = input.trim().replace(/[,\s$]/g, '');
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) throw new MoneyError(`Importe inválido: "${input}"`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -cents : cents;
}
