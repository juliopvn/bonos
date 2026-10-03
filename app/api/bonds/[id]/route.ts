import { requireSession } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { getBondWithIssuer } from '@/lib/repositories/bonds';
import { idParam } from '@/lib/route-helpers';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(async (_req, { params }) => {
  await requireSession();
  return ok(await getBondWithIssuer(idParam((await params).id)));
});
