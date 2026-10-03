/** "$1,234.56" → 123456 (céntimos enteros). */
export function centsFrom(text: string): number {
  const m = /(-)?\$?\s*(-)?([\d,]+)\.(\d{2})/.exec(text.replace(/\s/g, ''));
  if (!m) throw new Error(`No es un importe: "${text}"`);
  const cents = Number(m[3].replace(/,/g, '')) * 100 + Number(m[4]);
  return m[1] || m[2] ? -cents : cents;
}

export const isoPlusDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export function isoPlusMonths(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
