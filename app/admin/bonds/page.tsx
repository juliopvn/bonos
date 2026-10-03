import type { Metadata } from 'next';
import Link from 'next/link';
import { formatBps } from '@/lib/bps';
import { effectiveRateBps } from '@/lib/domain/schedule';
import { FREQUENCY_LABEL, TERM_LABEL } from '@/lib/domain/term';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { listBondsWithIssuer } from '@/lib/repositories/bonds';
import { BondStatusBadge, Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Emisiones' };
export const dynamic = 'force-dynamic';

export default async function BondsPage() {
  const bonds = await listBondsWithIssuer();
  return (
    <>
      <PageHeader eyebrow="Estructuración" title="Emisiones">
        <Link href="/admin/bonds/new" className="btn btn-primary" data-testid="new-bond">
          Nueva emisión
        </Link>
      </PageHeader>
      {bonds.length === 0 ? (
        <Empty title="Aún no hay emisiones">
          Estructura la primera: nominal, cupón, frecuencia y vencimiento.
        </Empty>
      ) : (
        <div className="card table-wrap rise-2">
          <table className="table" data-testid="bonds-table">
            <thead>
              <tr>
                <th>Emisión</th>
                <th>Emisor</th>
                <th>Estado</th>
                <th className="r">Nominal</th>
                <th className="r">Cupón</th>
                <th>Frecuencia</th>
                <th>Plazo</th>
                <th>Vence</th>
              </tr>
            </thead>
            <tbody>
              {bonds.map((b) => (
                <tr key={b._id.toHexString()}>
                  <td>
                    <Link
                      href={`/admin/bonds/${b._id}`}
                      className="font-semibold underline decoration-gilt underline-offset-4"
                      data-testid={`bond-link-${b.code}`}
                    >
                      {b.name}
                    </Link>
                    <div className="hint num">{b.code}</div>
                  </td>
                  <td>{b.issuer.name}</td>
                  <td>
                    <BondStatusBadge status={b.status} />
                  </td>
                  <td className="num r">{formatMoney(b.nominalCents)}</td>
                  <td className="num r">
                    {formatBps(effectiveRateBps(b))}
                    {b.couponType === 'floating' && <span className="hint"> var.</span>}
                  </td>
                  <td>{FREQUENCY_LABEL[b.frequency]}</td>
                  <td>{TERM_LABEL[b.term]}</td>
                  <td className="num">{formatDate(b.maturityDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
