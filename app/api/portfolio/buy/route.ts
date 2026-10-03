import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { buyActiveBond } from '@/lib/services/trading';
import { buySchema } from '@/lib/validation';

export const POST = route(async (req) => {
  const s = await requireRole('investor');
  const { bondId, units } = buySchema.parse(await readJson(req));
  return ok(await buyActiveBond(new ObjectId(s.sub), bondId, units), { status: 201 });
});
