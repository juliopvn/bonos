import { ObjectId } from 'mongodb';
import { formatBps, formatPrice } from '../bps';
import { col } from '../db';
import { toISODate } from '../domain/dates';
import { effectiveRateBps } from '../domain/schedule';
import { formatMoney } from '../money';
import { getBondWithIssuer } from '../repositories/bonds';
import { storeDocument } from './documents';

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: (string | number)[]) => cells.map(esc).join(',');

/** Reporte CSV por emisión: resumen, adjudicación, calendario de pagos y covenants. */
export async function buildBondReport(bondId: ObjectId): Promise<string> {
  const bond = await getBondWithIssuer(bondId);
  const [orders, payments, covenants] = await Promise.all([
    (await col('orders')).find({ bondId, status: { $in: ['allocated', 'partial', 'rejected'] } }).toArray(),
    (await col('scheduledPayments')).find({ bondId }).sort({ dueDate: 1, type: 1 }).toArray(),
    (await col('covenants')).find({ bondId }).toArray(),
  ]);
  const lines: string[] = [];
  lines.push(row('RESUMEN'));
  lines.push(row('Emisión', bond.name), row('Código', bond.code), row('Emisor', bond.issuer.name));
  lines.push(row('Rating', bond.issuer.rating), row('Estado', bond.status));
  lines.push(row('Nominal', formatMoney(bond.nominalCents)), row('Tasa de cupón', formatBps(effectiveRateBps(bond))));
  lines.push(row('Frecuencia (pagos/año)', bond.frequency), row('Emisión', toISODate(bond.issueDate)), row('Vencimiento', toISODate(bond.maturityDate)));
  lines.push(row('Títulos ofertados', bond.totalUnits));
  lines.push(row('Precio final (% nominal)', bond.finalPriceBps ? formatPrice(bond.finalPriceBps) : 'n/d'), '');
  lines.push(row('ADJUDICACIÓN'), row('Orden', 'Títulos solicitados', 'Precio límite', 'Títulos adjudicados', 'Estado'));
  for (const o of orders) lines.push(row(o._id.toHexString(), o.units, formatPrice(o.limitPriceBps), o.allocatedUnits, o.status));
  lines.push('', row('CALENDARIO DE PAGOS'), row('Fecha', 'Tipo', 'Inversor', 'Importe', 'Estado'));
  for (const p of payments) lines.push(row(toISODate(p.dueDate), p.type, p.investorId.toHexString(), formatMoney(p.amountCents), p.status));
  lines.push('', row('COVENANTS'), row('Descripción', 'Métrica', 'Umbral', 'Estado', 'Última revisión'));
  for (const c of covenants) lines.push(row(c.description, c.metric, c.threshold, c.status, toISODate(c.lastCheckedAt)));
  return lines.join('\n') + '\n';
}

export async function generateBondReport(actorId: ObjectId, bondId: ObjectId) {
  const csv = await buildBondReport(bondId);
  const bond = await getBondWithIssuer(bondId);
  const fileName = `reporte-${bond.code}-${toISODate(new Date())}.csv`;
  return storeDocument(actorId, bondId, bond.issuerId, 'report', fileName, 'text/csv', Buffer.from('﻿' + csv, 'utf8'));
}
