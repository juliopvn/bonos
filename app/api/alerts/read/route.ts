import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { objectId } from '@/lib/validation';

const schema = z.object({ ids: z.array(objectId).max(200).optional() });

/** Marca como leídas las alertas indicadas (o todas las del usuario si no se indican). */
export const POST = route(async (req) => {
  const s = await requireRole('investor');
  const { ids } = schema.parse(await readJson(req));
  const filter = { investorId: new ObjectId(s.sub), readAt: null, ...(ids ? { _id: { $in: ids } } : {}) };
  const res = await (await col('alerts')).updateMany(filter, { $set: { readAt: new Date() } });
  return ok({ updated: res.modifiedCount });
});
