import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { ok, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole('investor');
  const investorId = new ObjectId(s.sub);
  const alerts = await col('alerts');
  const items = await alerts.find({ investorId }).sort({ createdAt: -1 }).limit(100).toArray();
  return ok({ items, unread: await alerts.countDocuments({ investorId, readAt: null }) });
});
