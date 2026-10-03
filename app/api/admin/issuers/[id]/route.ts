import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { updateIssuer } from '@/lib/repositories/issuers';
import { idParam } from '@/lib/route-helpers';

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sector: z.string().trim().min(2).max(60).optional(),
  country: z.string().trim().min(2).max(60).optional(),
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const id = idParam((await params).id);
  const patch = patchSchema.parse(await readJson(req));
  const issuer = await updateIssuer(id, patch);
  await audit(new ObjectId(s.sub), 'issuer.update', 'issuer', id, patch);
  return ok(issuer);
});
