import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { readFsObject, verifyFsSignature } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Descarga firmada para el driver `fs` (solo CI). Con `s3` no se usa: la URL apunta al bucket. */
export async function GET(req: Request) {
  if (getEnv().STORAGE_DRIVER !== 'fs') return new NextResponse('No encontrado', { status: 404 });
  const q = new URL(req.url).searchParams;
  const key = q.get('key') ?? '';
  if (!verifyFsSignature(key, Number(q.get('exp')), q.get('sig') ?? '')) {
    return new NextResponse('Enlace inválido o caducado', { status: 403 });
  }
  const body = await readFsObject(key).catch(() => null);
  if (!body) return new NextResponse('No encontrado', { status: 404 });
  const name = q.get('name') ?? 'documento';
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
    },
  });
}
