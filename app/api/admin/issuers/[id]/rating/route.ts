import { ObjectId } from 'mongodb';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/guards';
import { ok, readJson, route } from '@/lib/http';
import { changeIssuerRating } from '@/lib/repositories/issuers';
import { idParam } from '@/lib/route-helpers';
import { notifyRatingChange } from '@/lib/services/alerts';
import { ratingChangeSchema } from '@/lib/validation';

export const POST = route<{ id: string }>(async (req, { params }) => {
  const s = await requireRole('admin');
  const id = idParam((await params).id);
  const { rating, agency } = ratingChangeSchema.parse(await readJson(req));
  const { previous, issuer } = await changeIssuerRating(id, rating, agency);
  await audit(new ObjectId(s.sub), 'issuer.rating_change', 'issuer', id, {
    from: previous,
    to: rating,
    agency,
  });
  const alerts = previous === rating ? 0 : await notifyRatingChange(id);
  return ok({ issuer, previous, alertsCreated: alerts });
});
