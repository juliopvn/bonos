import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { getEnv } from '../env';
import type { Role } from '../types';

const key = () => new TextEncoder().encode(getEnv().AUTH_SECRET);

export interface SessionClaims {
  sub: string;
  role: Role;
  email: string;
}

export async function signMagicToken(email: string): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const ttl = getEnv().MAGIC_LINK_TTL_MINUTES;
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 60_000);
  const token = await new SignJWT({ email, typ: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());
  return { token, jti, expiresAt };
}

export async function verifyMagicToken(token: string): Promise<{ email: string; jti: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.typ !== 'magic' || typeof payload.email !== 'string' || !payload.jti) return null;
    return { email: payload.email, jti: payload.jti };
  } catch {
    return null;
  }
}

export async function signSession(claims: SessionClaims): Promise<string> {
  const days = getEnv().SESSION_TTL_DAYS;
  return new SignJWT({ role: claims.role, email: claims.email, typ: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.typ !== 'session' || !payload.sub) return null;
    if (payload.role !== 'admin' && payload.role !== 'investor') return null;
    return { sub: payload.sub, role: payload.role, email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}
