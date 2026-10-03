import { ObjectId } from 'mongodb';
import { col } from '../db';
import { getEnv } from '../env';
import { formatPrice } from '../bps';
import { concentrationBreaches, dedupe, exceedsPriceMove } from '../domain/alerts';
import { addDays, toISODate } from '../domain/dates';
import { marketValueCents } from '../domain/valuation';
import { sendMail } from '../mailer';
import { alertEmail } from '../mailer/templates';
import { findUserById } from '../repositories/users';
import type { AlertType, IssuerDoc } from '../types';

export interface AlertPayload extends Record<string, unknown> {
  title: string;
  detail: string;
}

/** Crea la alerta si no existe (clave de deduplicación) y envía el email según preferencias. */
export async function createAlert(
  investorId: ObjectId,
  type: AlertType,
  payload: AlertPayload,
  dedupeKey: string,
): Promise<boolean> {
  const alerts = await col('alerts');
  const doc = {
    _id: new ObjectId(),
    investorId,
    type,
    payload,
    dedupeKey,
    readAt: null,
    emailedAt: null,
    createdAt: new Date(),
  };
  try {
    await alerts.insertOne(doc);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
  const user = await findUserById(investorId);
  if (user?.alertPrefs.email) {
    try {
      await sendMail({
        to: user.email,
        ...alertEmail({ title: payload.title, detail: payload.detail, link: `${getEnv().APP_BASE_URL}/investor/alerts` }),
      });
      await alerts.updateOne({ _id: doc._id }, { $set: { emailedAt: new Date() } });
    } catch (e) {
      console.error('[alerts] no se pudo enviar el email', e);
    }
  }
  return true;
}

/** Inversores con posición vigente en algún bono de la lista. */
async function holdersOf(bondIds: ObjectId[]): Promise<ObjectId[]> {
  if (bondIds.length === 0) return [];
  return (await col('positions')).distinct('investorId', { bondId: { $in: bondIds }, units: { $gt: 0 } });
}

async function notifyRatingEntry(issuer: IssuerDoc, index: number): Promise<number> {
  const entry = issuer.ratingHistory[index];
  const previous = issuer.ratingHistory[index - 1];
  if (!previous || previous.rating === entry.rating) return 0;
  const bondIds = await (await col('bonds')).distinct('_id', { issuerId: issuer._id });
  const holders = await holdersOf(bondIds);
  let created = 0;
  for (const investorId of holders) {
    const ok = await createAlert(
      investorId,
      'rating_change',
      {
        title: `Cambio de rating: ${issuer.name}`,
        detail: `${issuer.name} pasó de ${previous.rating} a ${entry.rating} (${entry.agency}).`,
        issuerId: issuer._id.toHexString(),
        from: previous.rating,
        to: entry.rating,
      },
      dedupe.rating(issuer._id.toHexString(), entry.rating, toISODate(entry.date)),
    );
    if (ok) created++;
  }
  return created;
}

/** Alertas por cambios de rating recientes (ventana de 7 días). Idempotente. */
export async function evaluateRatings(asOf: Date, issuerId?: ObjectId): Promise<number> {
  const since = addDays(asOf, -7);
  const issuers = await (await col('issuers'))
    .find(issuerId ? { _id: issuerId } : { 'ratingHistory.date': { $gte: since } })
    .toArray();
  let created = 0;
  for (const issuer of issuers) {
    for (let i = 1; i < issuer.ratingHistory.length; i++) {
      if (issuer.ratingHistory[i].date >= since) created += await notifyRatingEntry(issuer, i);
    }
  }
  return created;
}

/** Alertas por variación de precio entre las dos últimas cotizaciones, según umbral de cada usuario. */
export async function evaluatePriceMoves(asOf: Date, bondId?: ObjectId): Promise<number> {
  const bonds = await (await col('bonds'))
    .find(bondId ? { _id: bondId } : { status: 'active' })
    .toArray();
  const history = await col('priceHistory');
  let created = 0;
  for (const bond of bonds) {
    const [latest, prev] = await history
      .find({ bondId: bond._id, date: { $lte: asOf } })
      .sort({ date: -1 })
      .limit(2)
      .toArray();
    if (!latest || !prev) continue;
    for (const investorId of await holdersOf([bond._id])) {
      const user = await findUserById(investorId);
      if (!user || !exceedsPriceMove(prev.priceBps, latest.priceBps, user.alertPrefs.priceMoveBps)) continue;
      const up = latest.priceBps > prev.priceBps;
      const ok = await createAlert(
        investorId,
        'price_move',
        {
          title: `${up ? 'Sube' : 'Baja'} el precio de ${bond.name}`,
          detail: `Precio ${formatPrice(prev.priceBps)} → ${formatPrice(latest.priceBps)} (% del nominal).`,
          bondId: bond._id.toHexString(),
          from: prev.priceBps,
          to: latest.priceBps,
        },
        dedupe.price(bond._id.toHexString(), toISODate(latest.date)),
      );
      if (ok) created++;
    }
  }
  return created;
}

/** Alertas de rebalanceo por concentración (emisor, sector, plazo) sobre el umbral del usuario. */
export async function evaluateRebalance(asOf: Date): Promise<number> {
  const positions = await col('positions');
  const investorIds = await positions.distinct('investorId', { units: { $gt: 0 } });
  let created = 0;
  for (const investorId of investorIds) {
    const user = await findUserById(investorId);
    if (!user) continue;
    const held = await positions
      .aggregate<{ units: number; bond: { nominalCents: number; marketPriceBps: number | null; term: string }; issuer: { name: string; sector: string } }>([
        { $match: { investorId, units: { $gt: 0 } } },
        { $lookup: { from: 'bonds', localField: 'bondId', foreignField: '_id', as: 'bond' } },
        { $unwind: '$bond' },
        { $lookup: { from: 'issuers', localField: 'bond.issuerId', foreignField: '_id', as: 'issuer' } },
        { $unwind: '$issuer' },
      ])
      .toArray();
    if (held.length < 2) continue;
    const items = held.map((h) => ({
      valueCents: marketValueCents(h.units, h.bond.nominalCents, h.bond.marketPriceBps ?? 10_000),
      keys: { issuer: h.issuer.name, sector: h.issuer.sector, term: h.bond.term },
    }));
    for (const b of concentrationBreaches(items, user.alertPrefs.concentrationPct)) {
      const ok = await createAlert(
        investorId,
        'rebalance',
        {
          title: 'Conviene rebalancear tu cartera',
          detail: `${b.key} concentra ${(b.shareBps / 100).toFixed(1)}% de tu cartera (${b.dimension}); tu umbral es ${user.alertPrefs.concentrationPct}%.`,
          dimension: b.dimension,
          key: b.key,
          shareBps: b.shareBps,
        },
        dedupe.rebalance(b.dimension, b.key, toISODate(asOf)),
      );
      if (ok) created++;
    }
  }
  return created;
}

export async function runAlertsJob(asOf: Date) {
  const rating = await evaluateRatings(asOf);
  const price = await evaluatePriceMoves(asOf);
  const rebalance = await evaluateRebalance(asOf);
  return { rating, price, rebalance };
}

/** Evento: el admin cambió el rating de un emisor. */
export async function notifyRatingChange(issuerId: ObjectId): Promise<number> {
  return evaluateRatings(new Date(), issuerId);
}
