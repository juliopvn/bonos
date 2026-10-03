import { ObjectId } from 'mongodb';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { getBond } from '@/lib/repositories/bonds';
import { idParam } from '@/lib/route-helpers';
import { covenantSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireRole('admin');
  return ok({
    items: await (await col('covenants')).find({ bondId: idParam((await params).id) }).toArray(),
  });
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const bond = await getBond(idParam((await params).id));
  const input = covenantSchema.parse(await readJson(req));
  const doc = {
    _id: new ObjectId(),
    bondId: bond._id,
    ...input,
    status: 'ok' as const,
    lastCheckedAt: new Date(),
  };
  await (await col('covenants')).insertOne(doc);
  await audit(new ObjectId(s.sub), 'covenant.create', 'covenant', doc._id, {
    bondId: bond._id.toHexString(),
  });
  return ok(doc, { status: 201 });
});
