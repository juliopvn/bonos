import { col } from '../db';
import { getEnv } from '../env';
import { sendMail } from '../mailer';
import { magicLinkEmail } from '../mailer/templates';
import { rateLimit } from '../rate-limit';
import { upsertUserOnLogin } from '../repositories/users';
import type { UserDoc } from '../types';
import { signMagicToken, verifyMagicToken } from './jwt';

const WINDOW_SECONDS = 15 * 60;

/** Solicita un magic link. La respuesta al llamador es idéntica exista o no el usuario. */
export async function requestMagicLink(email: string, ip: string): Promise<void> {
  const env = getEnv();
  await rateLimit(`auth:email:${email}`, env.AUTH_RATE_LIMIT_MAX, WINDOW_SECONDS);
  await rateLimit(`auth:ip:${ip}`, env.AUTH_RATE_LIMIT_MAX * 4, WINDOW_SECONDS);

  const { token, jti, expiresAt } = await signMagicToken(email);
  await (await col('magicLinks')).insertOne({ jti, email, expiresAt, usedAt: null } as never);
  const link = `${env.APP_BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail({ to: email, ...magicLinkEmail(link, env.MAGIC_LINK_TTL_MINUTES) });
}

export type VerifyFailure = 'invalid' | 'used' | 'expired';

/** Valida firma, expiración y uso único del jti. Crea el usuario si no existía. */
export async function consumeMagicLink(
  token: string,
): Promise<{ user: UserDoc } | { error: VerifyFailure }> {
  const claims = await verifyMagicToken(token);
  if (!claims) return { error: 'invalid' };

  const links = await col('magicLinks');
  const now = new Date();
  // Operación atómica: solo un consumidor gana la carrera.
  const consumed = await links.findOneAndUpdate(
    { jti: claims.jti, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );
  if (!consumed) {
    const stored = await links.findOne({ jti: claims.jti });
    if (!stored) return { error: 'invalid' };
    return { error: stored.usedAt ? 'used' : 'expired' };
  }
  return { user: await upsertUserOnLogin(consumed.email) };
}
