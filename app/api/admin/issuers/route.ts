import { requireRole } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { ObjectId } from 'mongodb';
import { ok, readJson, route } from '@/lib/http';
import { createIssuer, listIssuers } from '@/lib/repositories/issuers';
import { issuerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireRole('admin');
  return ok({ items: await listIssuers() });
});

export const POST = route(async (req) => {
  const s = await requireRole('admin');
  const input = issuerSchema.parse(await readJson(req));
  const issuer = await createIssuer(input);
  await audit(new ObjectId(s.sub), 'issuer.create', 'issuer', issuer._id, { name: issuer.name, rating: issuer.rating });
  return ok(issuer, { status: 201 });
});
