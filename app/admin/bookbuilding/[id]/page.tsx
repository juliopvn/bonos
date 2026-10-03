import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBook } from '@/lib/services/bookbuilding';
import { idParam } from '@/lib/route-helpers';
import { plain } from '@/lib/plain';
import { PageHeader } from '@/components/ui';
import { LiveBook } from './LiveBook';

export const metadata: Metadata = { title: 'Libro de órdenes' };
export const dynamic = 'force-dynamic';

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getBook(idParam(id)).catch(() => null);
  if (!book) notFound();
  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/bookbuilding" className="underline">
          ← Bookbuilding
        </Link>
      </p>
      <PageHeader eyebrow="Libro de órdenes" title={book.bond.name} />
      <LiveBook bondId={id} initial={plain(book)} />
    </>
  );
}
