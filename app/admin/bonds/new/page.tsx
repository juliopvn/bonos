import type { Metadata } from 'next';
import { listIssuers } from '@/lib/repositories/issuers';
import { plain } from '@/lib/plain';
import { PageHeader, Empty } from '@/components/ui';
import { BondForm } from './BondForm';

export const metadata: Metadata = { title: 'Nueva emisión' };
export const dynamic = 'force-dynamic';

export default async function NewBondPage() {
  const issuers = plain(await listIssuers());
  return (
    <>
      <PageHeader eyebrow="Estructuración" title="Nueva emisión" />
      {issuers.length === 0 ? (
        <Empty title="Primero crea un emisor">Una emisión necesita un emisor con rating.</Empty>
      ) : (
        <BondForm issuers={issuers.map((i) => ({ id: i._id, name: i.name, rating: i.rating }))} />
      )}
    </>
  );
}
