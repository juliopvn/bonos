import { requireRole } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { getBook } from '@/lib/services/bookbuilding';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireRole('admin');
  return ok(await getBook(idParam((await params).id)));
});
