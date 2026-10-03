import { ObjectId } from 'mongodb';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { notFound, ok, readJson, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { covenantStatusSchema } from '@/lib/validation';

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const id = idParam((await params).id);
  const { status } = covenantStatusSchema.parse(await readJson(req));
  const doc = await (await col('covenants')).findOneAndUpdate(
    { _id: id },
    { $set: { status, lastCheckedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!doc) throw notFound('Covenant');
  await audit(new ObjectId(s.sub), 'covenant.status', 'covenant', id, { status });
  return ok(doc);
});
