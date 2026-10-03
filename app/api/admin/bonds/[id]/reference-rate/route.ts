import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { updateReferenceRate } from '@/lib/services/bonds';
import { referenceRateSchema } from '@/lib/validation';

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const { referenceRateBps } = referenceRateSchema.parse(await readJson(req));
  return ok(await updateReferenceRate(new ObjectId(s.sub), idParam((await params).id), referenceRateBps));
});
