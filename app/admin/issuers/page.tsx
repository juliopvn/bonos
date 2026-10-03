import type { Metadata } from 'next';
import { listIssuers } from '@/lib/repositories/issuers';
import { plain } from '@/lib/plain';
import { PageHeader } from '@/components/ui';
import { IssuerManager } from './IssuerManager';

export const metadata: Metadata = { title: 'Emisores' };
export const dynamic = 'force-dynamic';

export default async function IssuersPage() {
  const issuers = plain(await listIssuers());
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Emisores" />
      <IssuerManager issuers={issuers} />
    </>
  );
}
