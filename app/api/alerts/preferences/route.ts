import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { notFound, ok, readJson, route } from '@/lib/http';
import { findUserById, updateAlertPrefs } from '@/lib/repositories/users';
import { alertPrefsSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole('investor');
  const user = await findUserById(s.sub);
  if (!user) throw notFound('Usuario');
  return ok(user.alertPrefs);
});

export const PUT = route(async (req) => {
  const s = await requireRole('investor');
  const prefs = alertPrefsSchema.parse(await readJson(req));
  await updateAlertPrefs(new ObjectId(s.sub), prefs);
  return ok(prefs);
});
