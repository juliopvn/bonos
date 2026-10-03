const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "15 may 2031" — fechas siempre en UTC (el dominio trabaja en días naturales UTC). */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export const formatDateTime = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${formatDate(date)} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

export const isoDay = (d: Date | string): string =>
  (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

/** Cobertura ×100 → "2.5×". */
export const formatCoverage = (x100: number): string => `${(x100 / 100).toFixed(2)}×`;

export const signed = (cents: number): 'pos' | 'neg' | undefined =>
  cents > 0 ? 'pos' : cents < 0 ? 'neg' : undefined;
