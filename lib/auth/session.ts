import { cookies } from 'next/headers';
import { getEnv } from '../env';
import { signSession, verifySession, type SessionClaims } from './jwt';

export const SESSION_COOKIE = 'bonos_session';

export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function sessionCookie(claims: SessionClaims) {
  const env = getEnv();
  return {
    name: SESSION_COOKIE,
    value: await signSession(claims),
    httpOnly: true,
    secure: env.APP_BASE_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * 86_400,
  };
}

export const clearedSessionCookie = () => ({
  name: SESSION_COOKIE,
  value: '',
  httpOnly: true,
  path: '/',
  maxAge: 0,
});
