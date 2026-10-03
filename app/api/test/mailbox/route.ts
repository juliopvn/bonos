import { NextResponse } from 'next/server';
import { col } from '@/lib/db';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Solo existe con E2E_MODE=true (lectura del buzón en memoria para CI). */
export async function GET(req: Request) {
  if (!getEnv().E2E_MODE) return new NextResponse(null, { status: 404 });
  const to = new URL(req.url).searchParams.get('to');
  const mailbox = await col('testMailbox');
  const items = await mailbox
    .find(to ? { to } : {})
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return NextResponse.json({ items });
}
