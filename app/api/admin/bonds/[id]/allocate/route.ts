import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { closeAndAllocate } from '@/lib/services/bookbuilding';
import { closeBookSchema } from '@/lib/validation';

export const POST = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const { finalPriceBps } = closeBookSchema.parse(await readJson(req));
  const { bond, allocatedUnits } = await closeAndAllocate(
    new ObjectId(s.sub),
    idParam((await params).id),
    finalPriceBps,
  );
  return ok({ bond, allocatedUnits });
});
