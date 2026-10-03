import { col } from '../db';
import { aggregateDemand } from '../domain/bookbuilding';
import { startOfUtcDay } from '../domain/dates';
import { bondLookupStages, type BondWithIssuer } from '../repositories/bonds';

export type PaymentFilter = 'upcoming' | 'overdue' | 'paid' | 'all';

/** Calendario global de pagos agrupado por (bono, fecha, tipo). */
export async function paymentsCalendar(filter: PaymentFilter, asOf: Date = new Date()) {
  const today = startOfUtcDay(asOf);
  const match: Record<string, unknown> =
    filter === 'paid'
      ? { status: 'paid' }
      : filter === 'overdue'
        ? { status: 'scheduled', dueDate: { $lt: today } }
        : filter === 'upcoming'
          ? { status: 'scheduled', dueDate: { $gte: today } }
          : {};
  return (await col('scheduledPayments'))
    .aggregate<{
      _id: { bondId: unknown; dueDate: Date; type: string; status: string };
      totalCents: number;
      investors: number;
      bond: { name: string; code: string };
    }>([
      { $match: match },
      {
        $group: {
          _id: { bondId: '$bondId', dueDate: '$dueDate', type: '$type', status: '$status' },
          totalCents: { $sum: '$amountCents' },
          investors: { $sum: 1 },
        },
      },
      { $lookup: { from: 'bonds', localField: '_id.bondId', foreignField: '_id', as: 'bond' } },
      { $unwind: '$bond' },
      { $sort: filter === 'paid' ? { '_id.dueDate': -1 } : { '_id.dueDate': 1 } },
      { $limit: 200 },
    ])
    .toArray();
}

export async function adminOverview(asOf: Date = new Date()) {
  const today = startOfUtcDay(asOf);
  const in30 = new Date(today.getTime() + 30 * 86_400_000);
  const [byStatus, openBonds, upcoming, breaches, issuers] = await Promise.all([
    (await col('bonds'))
      .aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }])
      .toArray(),
    (await col('bonds'))
      .aggregate<BondWithIssuer>([{ $match: { status: 'bookbuilding' } }, ...bondLookupStages])
      .toArray(),
    (await col('scheduledPayments'))
      .aggregate<{ total: number; n: number }>([
        { $match: { status: 'scheduled', dueDate: { $gte: today, $lte: in30 } } },
        { $group: { _id: null, total: { $sum: '$amountCents' }, n: { $sum: 1 } } },
      ])
      .toArray(),
    (await col('covenants')).countDocuments({ status: 'breach' }),
    (await col('issuers')).countDocuments(),
  ]);
  const books = [];
  for (const bond of openBonds) {
    const orders = await (
      await col('orders')
    )
      .find({ bondId: bond._id, status: 'pending' })
      .toArray();
    const demand = aggregateDemand(
      orders.map((o) => ({
        id: o._id.toHexString(),
        units: o.units,
        limitPriceBps: o.limitPriceBps,
        createdAt: o.createdAt,
      })),
      bond.totalUnits,
    );
    books.push({ bond, demand });
  }
  const count = (s: string) => byStatus.find((b) => b._id === s)?.n ?? 0;
  return {
    issuers,
    counts: {
      draft: count('draft'),
      bookbuilding: count('bookbuilding'),
      allocated: count('allocated'),
      active: count('active'),
      matured: count('matured'),
    },
    next30dCents: upcoming[0]?.total ?? 0,
    next30dCount: upcoming[0]?.n ?? 0,
    breaches,
    books,
  };
}
