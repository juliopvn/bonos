import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { route } from '@/lib/http';
import { idParam } from '@/lib/route-helpers';
import { authorizedDownloadUrl } from '@/lib/services/documents';

export const dynamic = 'force-dynamic';

/** Autoriza en servidor y redirige a una URL firmada de corta duración. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const s = await requireSession();
  const url = await authorizedDownloadUrl({ id: s.sub, role: s.role }, idParam((await params).id));
  return NextResponse.redirect(url, 302);
});
