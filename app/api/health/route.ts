import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db';
import { pingStorage } from '@/lib/storage';
import { pingMailer } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

async function check(fn: () => Promise<void>): Promise<'ok' | 'error'> {
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function GET() {
  const [mongo, storage, mailer] = await Promise.all([check(pingDb), check(pingStorage), check(pingMailer)]);
  const ok = mongo === 'ok' && storage === 'ok' && mailer === 'ok';
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', services: { mongo, storage, mailer } },
    { status: ok ? 200 : 503 },
  );
}
