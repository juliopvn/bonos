import type { Metadata } from 'next';
import Link from 'next/link';
import { formatBps } from '@/lib/bps';
import { formatCoverage } from '@/lib/format';
import { adminOverview } from '@/lib/services/admin';
import { Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Bookbuilding' };
export const dynamic = 'force-dynamic';

export default async function BookbuildingList() {
  const { books } = await adminOverview();
  return (
    <>
      <PageHeader eyebrow="Mercado primario" title="Bookbuilding" />
      {books.length === 0 ? (
        <Empty title="No hay libros abiertos">
          Abre el bookbuilding desde una emisión en borrador.
        </Empty>
      ) : (
        <div className="card table-wrap rise-2">
          <table className="table" data-testid="books-table">
            <thead>
              <tr>
                <th>Emisión</th>
                <th>Emisor</th>
                <th className="r">Ofertados</th>
                <th className="r">Demanda</th>
                <th className="r">Cobertura</th>
                <th className="r">Órdenes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {books.map(({ bond, demand }) => (
                <tr key={bond._id.toHexString()}>
                  <td className="font-semibold">
                    {bond.name}
                    <div className="hint num">
                      {bond.code} · cupón{' '}
                      {formatBps(
                        bond.couponRateBps ?? (bond.referenceRateBps ?? 0) + (bond.spreadBps ?? 0),
                      )}
                    </div>
                  </td>
                  <td>{bond.issuer.name}</td>
                  <td className="num r">{bond.totalUnits.toLocaleString('es-MX')}</td>
                  <td className="num r">{demand.totalUnits.toLocaleString('es-MX')}</td>
                  <td className="num r">{formatCoverage(demand.coverageX100)}</td>
                  <td className="num r">{demand.orderCount}</td>
                  <td className="r">
                    <Link
                      className="btn btn-ghost btn-sm"
                      href={`/admin/bookbuilding/${bond._id}`}
                      data-testid={`open-book-${bond.code}`}
                    >
                      Abrir libro
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
