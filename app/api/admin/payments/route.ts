import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { paymentsCalendar } from '@/lib/services/admin';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireRole('admin');
  const filter = z
    .enum(['upcoming', 'overdue', 'paid', 'all'])
    .catch('upcoming')
    .parse(new URL(req.url).searchParams.get('status'));
  return ok({ items: await paymentsCalendar(filter) });
});
