import { redirect } from 'next/navigation';
import { forbidden, unauthorized } from '../http';
import type { Role } from '../types';
import type { SessionClaims } from './jwt';
import { getSession } from './session';

/** API Routes: lanza 401 si no hay sesión. */
export async function requireSession(): Promise<SessionClaims> {
  const s = await getSession();
  if (!s) throw unauthorized();
  return s;
}

/** API Routes: lanza 401/403 según corresponda. */
export async function requireRole(role: Role): Promise<SessionClaims> {
  const s = await requireSession();
  if (s.role !== role) throw forbidden();
  return s;
}

/** Server Components: redirige a /login si no hay sesión. */
export async function requirePageSession(): Promise<SessionClaims> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

/** Server Components: redirige al área propia si el rol no coincide. */
export async function requirePageRole(role: Role): Promise<SessionClaims> {
  const s = await requirePageSession();
  if (s.role !== role) redirect(s.role === 'admin' ? '/admin' : '/investor');
  return s;
}
