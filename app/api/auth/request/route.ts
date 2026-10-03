import { loginRequestSchema } from '@/lib/validation';
import { readJson, route, ok } from '@/lib/http';
import { requestMagicLink } from '@/lib/auth/magic-link';

export const POST = route(async (req) => {
  const { email } = loginRequestSchema.parse(await readJson(req));
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  await requestMagicLink(email, ip);
  // Respuesta idéntica exista o no el usuario (no se filtran correos).
  return ok({ ok: true });
});
