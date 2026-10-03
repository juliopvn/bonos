import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { paymentsCalendar, type PaymentFilter } from '@/lib/services/admin';
import { Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Pagos' };
export const dynamic = 'force-dynamic';

const TABS: [PaymentFilter, string][] = [['upcoming', 'Próximos'], ['overdue', 'Vencidos'], ['paid', 'Pagados']];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = (TABS.find(([k]) => k === status)?.[0] ?? 'upcoming') as PaymentFilter;
  const rows = await paymentsCalendar(filter);
  return (
    <>
      <PageHeader eyebrow="Automatización" title="Calendario de pagos" />
      <nav aria-label="Estado de los pagos" className="mb-5 flex gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/payments?status=${k}`} data-testid={`tab-${k}`}
            className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`} aria-current={filter === k ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty title="No hay pagos en esta vista">Los pagos se generan al adjudicar una emisión y se marcan como pagados con el job diario.</Empty>
      ) : (
        <div className="card table-wrap rise-2">
          <table className="table" data-testid="payments-table">
            <thead><tr><th>Fecha</th><th>Emisión</th><th>Tipo</th><th className="r">Inversores</th><th className="r">Importe total</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="num">{formatDate(r._id.dueDate)}</td>
                  <td>{r.bond.name} <span className="hint num">{r.bond.code}</span></td>
                  <td><span className={`badge ${r._id.type === 'principal' ? 'badge-warn' : 'badge-info'}`}>{r._id.type === 'principal' ? 'Principal' : 'Cupón'}</span></td>
                  <td className="num r">{r.investors}</td>
                  <td className="num r">{formatMoney(r.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
