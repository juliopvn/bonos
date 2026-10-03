import Link from 'next/link';
import type { Metadata } from 'next';
import { formatBps } from '@/lib/bps';
import { formatCoverage } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { adminOverview } from '@/lib/services/admin';
import { Empty, PageHeader, Stat } from '@/components/ui';

export const metadata: Metadata = { title: 'Resumen' };

export default async function AdminHome() {
  const o = await adminOverview();
  return (
    <>
      <PageHeader eyebrow="Mesa de emisión" title="Resumen">
        <Link href="/admin/bonds/new" className="btn btn-primary" data-testid="new-bond">
          Nueva emisión
        </Link>
      </PageHeader>

      <div className="rise-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Emisiones vigentes" value={o.counts.active} sub={`${o.counts.matured} vencidas · ${o.issuers} emisores`} />
        <Stat label="En bookbuilding" value={o.counts.bookbuilding} sub={`${o.counts.draft} en borrador`} />
        <Stat label="Pagos próximos 30 días" value={formatMoney(o.next30dCents)} sub={`${o.next30dCount} pagos a inversores`} />
        <Stat label="Covenants en incumplimiento" value={o.breaches} tone={o.breaches > 0 ? 'neg' : undefined} sub={o.breaches ? 'Revisa cumplimiento' : 'Todo en orden'} />
      </div>

      <section className="mt-10" aria-labelledby="books">
        <h2 id="books" className="display mb-4 text-2xl">
          Libros abiertos
        </h2>
        {o.books.length === 0 ? (
          <Empty title="No hay libros abiertos">Abre el bookbuilding de una emisión en borrador para recibir órdenes.</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {o.books.map(({ bond, demand }) => (
              <Link key={bond._id.toHexString()} href={`/admin/bookbuilding/${bond._id}`} className="card card-pad block hover:border-verdigris">
                <p className="eyebrow">{bond.issuer.name}</p>
                <p className="display mt-1 text-2xl">{bond.name}</p>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="label">Cobertura</dt><dd className="num font-medium">{formatCoverage(demand.coverageX100)}</dd></div>
                  <div><dt className="label">Órdenes</dt><dd className="num font-medium">{demand.orderCount}</dd></div>
                  <div><dt className="label">Cupón</dt><dd className="num font-medium">{formatBps(bond.couponRateBps ?? (bond.referenceRateBps ?? 0) + (bond.spreadBps ?? 0))}</dd></div>
                </dl>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
