import { ObjectId } from 'mongodb';
import { audit } from '../audit';
import { col, getMongoClient } from '../db';
import { getEnv } from '../env';
import { formatPrice } from '../bps';
import { startOfUtcDay } from '../domain/dates';
import { aggregateDemand, allocate, type BookOrder } from '../domain/bookbuilding';
import { flowsForUnits } from '../domain/schedule';
import { marketValueCents } from '../domain/valuation';
import { badRequest, conflict, notFound } from '../http';
import { sendMail } from '../mailer';
import { allocationEmail } from '../mailer/templates';
import { getBond } from '../repositories/bonds';
import type { BondDoc, OrderDoc, PositionDoc, ScheduledPaymentDoc } from '../types';
import { bondFlows, computeYtm } from './bonds';

export async function placeOrder(
  investorId: ObjectId,
  input: { bondId: ObjectId; units: number; limitPriceBps: number },
): Promise<OrderDoc> {
  const bond = await getBond(input.bondId);
  if (bond.status !== 'bookbuilding') throw conflict('El libro de órdenes de esta emisión no está abierto');
  const doc: OrderDoc = {
    _id: new ObjectId(),
    bondId: bond._id,
    investorId,
    units: input.units,
    limitPriceBps: input.limitPriceBps,
    status: 'pending',
    allocatedUnits: 0,
    createdAt: new Date(),
  };
  await (await col('orders')).insertOne(doc);
  return doc;
}

export async function cancelOrder(investorId: ObjectId, orderId: ObjectId): Promise<void> {
  const orders = await col('orders');
  const order = await orders.findOne({ _id: orderId, investorId });
  if (!order) throw notFound('Orden');
  const bond = await getBond(order.bondId);
  if (bond.status !== 'bookbuilding' || order.status !== 'pending') {
    throw conflict('Solo se pueden cancelar órdenes pendientes mientras el libro esté abierto');
  }
  await orders.updateOne({ _id: orderId, status: 'pending' }, { $set: { status: 'cancelled' } });
}

const toBookOrder = (o: OrderDoc): BookOrder => ({
  id: o._id.toHexString(),
  units: o.units,
  limitPriceBps: o.limitPriceBps,
  createdAt: o.createdAt,
});

/** Libro en vivo: demanda agregada + órdenes pendientes con el correo del inversor. */
export async function getBook(bondId: ObjectId) {
  const bond = await getBond(bondId);
  const orders = await (await col('orders'))
    .aggregate<OrderDoc & { investor: { email: string } }>([
      { $match: { bondId, status: 'pending' } },
      { $lookup: { from: 'users', localField: 'investorId', foreignField: '_id', as: 'investor' } },
      { $unwind: '$investor' },
      { $sort: { createdAt: 1 } },
    ])
    .toArray();
  return {
    bond,
    demand: aggregateDemand(orders.map(toBookOrder), bond.totalUnits),
    orders: orders.map((o) => ({
      id: o._id.toHexString(),
      investor: o.investor.email,
      units: o.units,
      limitPriceBps: o.limitPriceBps,
      createdAt: o.createdAt,
    })),
  };
}

/**
 * Cierra el libro, fija el precio final y adjudica — todo en una transacción:
 * órdenes, posiciones, pagos programados por inversor y estado del bono.
 */
export async function closeAndAllocate(actorId: ObjectId, bondId: ObjectId, finalPriceBps: number) {
  const client = getMongoClient();
  const session = client.startSession();
  const now = new Date();
  const today = startOfUtcDay(now);
  let result!: {
    bond: BondDoc;
    allocatedUnits: number;
    byInvestor: Map<string, { investorId: ObjectId; allocated: number; requested: number }>;
  };

  try {
    await session.withTransaction(async () => {
      const [bonds, ordersCol, positionsCol, paymentsCol, historyCol] = await Promise.all([
        col('bonds'),
        col('orders'),
        col('positions'),
        col('scheduledPayments'),
        col('priceHistory'),
      ]);
      const bond = await bonds.findOne({ _id: bondId, status: 'bookbuilding' }, { session });
      if (!bond) throw conflict('La emisión no está en bookbuilding');

      const orders = await ordersCol.find({ bondId, status: 'pending' }, { session }).toArray();
      if (orders.length === 0) throw badRequest('El libro no tiene órdenes que adjudicar');
      const allocations = allocate(orders.map(toBookOrder), finalPriceBps, bond.totalUnits);
      const byId = new Map(allocations.map((a) => [a.id, a]));

      const byInvestor = new Map<string, { investorId: ObjectId; allocated: number; requested: number }>();
      for (const o of orders) {
        const a = byId.get(o._id.toHexString())!;
        await ordersCol.updateOne(
          { _id: o._id },
          { $set: { status: a.status, allocatedUnits: a.allocatedUnits } },
          { session },
        );
        const key = o.investorId.toHexString();
        const agg = byInvestor.get(key) ?? { investorId: o.investorId, allocated: 0, requested: 0 };
        agg.allocated += a.allocatedUnits;
        agg.requested += o.units;
        byInvestor.set(key, agg);
      }

      const flows = bondFlows(bond);
      const positions: PositionDoc[] = [];
      const payments: ScheduledPaymentDoc[] = [];
      for (const { investorId, allocated } of byInvestor.values()) {
        if (allocated === 0) continue;
        positions.push({
          _id: new ObjectId(),
          investorId,
          bondId,
          units: allocated,
          avgCostBps: finalPriceBps,
          acquiredAt: now,
        });
        for (const f of flowsForUnits(flows, allocated)) {
          payments.push({
            _id: new ObjectId(),
            bondId,
            investorId,
            type: f.type,
            dueDate: f.dueDate,
            amountCents: f.amountCents,
            status: 'scheduled',
            paidAt: null,
          });
        }
      }
      if (positions.length) await positionsCol.insertMany(positions, { session });
      if (payments.length) await paymentsCol.insertMany(payments, { session });

      const allocatedUnits = allocations.reduce((s, a) => s + a.allocatedUnits, 0);
      const settle = bond.issueDate > today ? bond.issueDate : today;
      const ytmBps = computeYtm(bond, finalPriceBps, settle) ?? bond.ytmBps;
      const status = bond.issueDate <= today ? 'active' : 'allocated';
      const updated = await bonds.findOneAndUpdate(
        { _id: bondId },
        {
          $set: {
            status,
            finalPriceBps,
            marketPriceBps: finalPriceBps,
            ytmBps,
            availableUnits: bond.totalUnits - allocatedUnits,
          },
        },
        { session, returnDocument: 'after' },
      );
      await historyCol.updateOne(
        { bondId, date: today },
        { $set: { priceBps: finalPriceBps, ytmBps: ytmBps ?? 0 } },
        { upsert: true, session },
      );
      result = { bond: updated!, allocatedUnits, byInvestor };
    });
  } finally {
    await session.endSession();
  }

  await audit(actorId, 'bond.allocate', 'bond', bondId, {
    finalPriceBps,
    allocatedUnits: result.allocatedUnits,
    investors: result.byInvestor.size,
  });

  // Notificación por email (fuera de la transacción; un fallo no revierte la adjudicación).
  const users = await col('users');
  for (const { investorId, allocated, requested } of result.byInvestor.values()) {
    const user = await users.findOne({ _id: investorId });
    if (!user) continue;
    try {
      await sendMail({
        to: user.email,
        ...allocationEmail({
          bondName: result.bond.name,
          allocatedUnits: allocated,
          requestedUnits: requested,
          priceLabel: `${formatPrice(finalPriceBps)}% del nominal`,
          amountCents: marketValueCents(allocated, result.bond.nominalCents, finalPriceBps),
          link: `${getEnv().APP_BASE_URL}/investor`,
        }),
      });
    } catch (e) {
      console.error('[bookbuilding] email de adjudicación', e);
    }
  }
  return { bond: result.bond, allocatedUnits: result.allocatedUnits };
}
