import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';
import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Primera barrera de navegación. NO sustituye la autorización en servidor:
 * cada API Route y Server Component vuelve a validar sesión y rol.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (pathname === '/') return to(session ? (session.role === 'admin' ? '/admin' : '/investor') : '/login');
  if (!session) return to('/login');
  if (pathname.startsWith('/admin') && session.role !== 'admin') return to('/investor');
  if (pathname.startsWith('/investor') && session.role !== 'investor') return to('/admin');
  return NextResponse.next();
}

export const config = { matcher: ['/', '/admin/:path*', '/investor/:path*'] };
