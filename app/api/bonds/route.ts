import { requireSession } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { screenBonds } from '@/lib/services/screener';
import { screenerSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requireSession();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = screenerSchema.parse(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '')));
  return ok(await screenBonds(query));
});
