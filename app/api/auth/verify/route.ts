import { NextResponse } from 'next/server';
import { consumeMagicLink } from '@/lib/auth/magic-link';
import { sessionCookie } from '@/lib/auth/session';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const base = getEnv().APP_BASE_URL;
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const result = await consumeMagicLink(token);
  if ('error' in result) {
    return NextResponse.redirect(`${base}/verify?error=${result.error}`);
  }
  const { user } = result;
  const res = NextResponse.redirect(`${base}${user.role === 'admin' ? '/admin' : '/investor'}`);
  res.cookies.set(await sessionCookie({ sub: user._id.toHexString(), role: user.role, email: user.email }));
  return res;
}
