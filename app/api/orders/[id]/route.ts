import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { cancelOrder } from '@/lib/services/bookbuilding';

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const s = await requireRole('investor');
  await cancelOrder(new ObjectId(s.sub), idParam((await params).id));
  return ok({ ok: true });
});
