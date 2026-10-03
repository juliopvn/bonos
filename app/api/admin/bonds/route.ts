import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { listBondsWithIssuer } from '@/lib/repositories/bonds';
import { createBond } from '@/lib/services/bonds';
import { bondSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireRole('admin');
  return ok({ items: await listBondsWithIssuer() });
});

export const POST = route(async (req) => {
  const s = await requireRole('admin');
  const input = bondSchema.parse(await readJson(req));
  return ok(await createBond(new ObjectId(s.sub), input), { status: 201 });
});
