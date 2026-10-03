import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { generateBondReport } from '@/lib/services/reports';

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const s = await requireRole('admin');
  return ok(await generateBondReport(new ObjectId(s.sub), idParam((await params).id)), {
    status: 201,
  });
});
