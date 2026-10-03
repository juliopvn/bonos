/** Utilidades de fecha en UTC (medianoche). Todo el dominio trabaja en días naturales UTC. */

export const MS_DAY = 86_400_000;

export const utcDate = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

export function parseISODate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Fecha inválida (YYYY-MM-DD): "${s}"`);
  const d = utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
  if (toISODate(d) !== s) throw new Error(`Fecha inexistente: "${s}"`);
  return d;
}

export const toISODate = (d: Date): string => d.toISOString().slice(0, 10);

export const startOfUtcDay = (d: Date): Date =>
  utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const isEndOfMonth = (d: Date): boolean =>
  d.getUTCDate() === daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);

/** Suma meses conservando el día; si `eom` es true, queda en fin de mes. */
export function addMonths(d: Date, months: number, eom = false): Date {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = daysInMonth(y, m);
  return utcDate(y, m, eom ? last : Math.min(d.getUTCDate(), last));
}

export const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / MS_DAY);

/** Días 30/360 (US/NASD simplificado). */
export function days360(a: Date, b: Date): number {
  let d1 = a.getUTCDate();
  let d2 = b.getUTCDate();
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 360 +
    (b.getUTCMonth() - a.getUTCMonth()) * 30 +
    (d2 - d1)
  );
}

export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * MS_DAY);
