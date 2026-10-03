import { ObjectId } from 'mongodb';
import { requireSession } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { countUnreadAlerts } from '@/lib/repositories/alerts';
import { findUserById } from '@/lib/repositories/users';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireSession();
  const user = await findUserById(s.sub);
  return ok({
    id: s.sub,
    email: s.email,
    name: user?.name ?? s.email,
    role: s.role,
    unreadAlerts: s.role === 'investor' ? await countUnreadAlerts(new ObjectId(s.sub)) : 0,
  });
});
