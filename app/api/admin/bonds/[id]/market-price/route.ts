import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { updateMarketPrice } from '@/lib/services/bonds';
import { marketPriceSchema } from '@/lib/validation';

export const POST = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const { priceBps } = marketPriceSchema.parse(await readJson(req));
  return ok(await updateMarketPrice(new ObjectId(s.sub), idParam((await params).id), priceBps));
});
