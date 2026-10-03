import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { placeOrder } from '@/lib/services/bookbuilding';
import { orderSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Solo el propio inversor ve sus órdenes. */
export const GET = route(async () => {
  const s = await requireRole('investor');
  const items = await (
    await col('orders')
  )
    .find({ investorId: new ObjectId(s.sub) })
    .sort({ createdAt: -1 })
    .toArray();
  return ok({ items });
});

export const POST = route(async (req) => {
  const s = await requireRole('investor');
  const input = orderSchema.parse(await readJson(req));
  return ok(await placeOrder(new ObjectId(s.sub), input), { status: 201 });
});
