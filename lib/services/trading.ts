import { ObjectId } from 'mongodb';
import { audit } from '../audit';
import { col, getMongoClient } from '../db';
import { startOfUtcDay } from '../domain/dates';
import { flowsForUnits } from '../domain/schedule';
import { marketValueCents } from '../domain/valuation';
import { mulDiv } from '../money';
import { conflict } from '../http';
import { getBond } from '../repositories/bonds';
import { bondFlows } from './bonds';

/**
 * Compra en mercado secundario simulado: precio de mercado vigente contra el inventario disponible.
 * Crea/incrementa la posición y programa los pagos futuros restantes (en una transacción).
 */
export async function buyActiveBond(investorId: ObjectId, bondId: ObjectId, units: number) {
  const client = getMongoClient();
  const session = client.startSession();
  const now = new Date();
  const today = startOfUtcDay(now);
  let outcome!: { priceBps: number; amountCents: number };

  try {
    await session.withTransaction(async () => {
      const bond = await getBond(bondId);
      if (bond.status !== 'active' || bond.marketPriceBps == null) {
        throw conflict('Solo se pueden comprar bonos vigentes; en bookbuilding coloca una orden');
      }
      // Reserva atómica de inventario.
      const reserved = await (await col('bonds')).findOneAndUpdate(
        { _id: bondId, status: 'active', availableUnits: { $gte: units } },
        { $inc: { availableUnits: -units } },
        { session },
      );
      if (!reserved) throw conflict('No hay suficientes títulos disponibles');

      const priceBps = bond.marketPriceBps;
      const positions = await col('positions');
      const existing = await positions.findOne({ investorId, bondId }, { session });
      if (existing && existing.units > 0) {
        const totalUnits = existing.units + units;
        const avgCostBps = mulDiv(existing.units * existing.avgCostBps + units * priceBps, 1, totalUnits);
        await positions.updateOne({ _id: existing._id }, { $set: { units: totalUnits, avgCostBps } }, { session });
      } else if (existing) {
        await positions.updateOne(
          { _id: existing._id },
          { $set: { units, avgCostBps: priceBps, acquiredAt: now } },
          { session },
        );
      } else {
        await positions.insertOne(
          { _id: new ObjectId(), investorId, bondId, units, avgCostBps: priceBps, acquiredAt: now },
          { session },
        );
      }

      // Un único documento por (inversor, bono, tipo, fecha): se acumula con $inc.
      const payments = await col('scheduledPayments');
      for (const f of flowsForUnits(bondFlows(bond), units, today)) {
        await payments.updateOne(
          { bondId, investorId, type: f.type, dueDate: f.dueDate },
          { $inc: { amountCents: f.amountCents }, $setOnInsert: { _id: new ObjectId(), status: 'scheduled', paidAt: null } },
          { upsert: true, session },
        );
      }
      outcome = { priceBps, amountCents: marketValueCents(units, bond.nominalCents, priceBps) };
    });
  } finally {
    await session.endSession();
  }
  await audit(investorId, 'trade.buy', 'bond', bondId, { units, ...outcome });
  return outcome;
}
