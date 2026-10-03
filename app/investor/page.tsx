import type { Metadata } from 'next';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import { DistBars, LineChart, moneyChart } from '@/components/charts';
import { Empty, PageHeader, Stat } from '@/components/ui';
import { formatBps, formatPrice } from '@/lib/bps';
import { requirePageRole } from '@/lib/auth/guards';
import { isoDay, formatDate, signed } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { getPortfolio, priceOf } from '@/lib/services/portfolio';

export const metadata: Metadata = { title: 'Mi cartera' };
export const dynamic = 'force-dynamic';

export default async function InvestorHome() {
  const session = await requirePageRole('investor');
  const p = await getPortfolio(new ObjectId(session.sub));

  if (p.rows.length === 0 && p.collectedCents === 0) {
    return (
      <>
        <PageHeader eyebrow="Tablero de posición" title="Mi cartera" />
        <Empty title="Aún no tienes bonos">
          Explora el screener, filtra por rating y rendimiento, y compra tu primer bono.
          <div className="mt-4"><Link href="/investor/screener" className="btn btn-primary">Ir al screener</Link></div>
        </Empty>
      </>
    );
  }

  const pnlBps = p.costCents ? Math.round((p.pnlCents * 10_000) / p.costCents) : 0;
  return (
    <>
      <PageHeader eyebrow="Tablero de posición" title="Mi cartera">
        <Link href="/investor/screener" className="btn btn-primary">Buscar bonos</Link>
      </PageHeader>

      <div className="rise-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Valor de mercado" value={<span data-testid="kpi-market">{formatMoney(p.marketValueCents)}</span>} sub={`Costo ${formatMoney(p.costCents)}`} />
        <Stat label="Ganancia / pérdida" value={<span data-testid="kpi-pnl">{formatMoney(p.pnlCents)}</span>} tone={signed(p.pnlCents)} sub={formatBps(pnlBps)} />
        <Stat label="Cupones cobrados" value={<span data-testid="kpi-collected">{formatMoney(p.collectedCents)}</span>} sub="Histórico acumulado" />
        <Stat label="Por cobrar" value={<span data-testid="kpi-upcoming">{formatMoney(p.upcomingCents)}</span>} sub={p.overdueCount ? `${p.overdueCount} pagos vencidos en proceso` : 'Cupones y principal programados'} />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="perf" className="card card-pad">
            <h2 id="perf" className="display mb-1 text-2xl">Rendimiento histórico</h2>
            <p className="hint mb-3">Valor de mercado + pagos cobrados, frente al costo de adquisición.</p>
            <LineChart
              points={p.performance.map((x) => ({ date: x.date, value: x.totalCents }))}
              label="Valor total de la cartera"
              format={moneyChart}
              baseline={p.costCents}
              testId="performance-chart"
            />
          </section>

          <section aria-labelledby="pos">
            <h2 id="pos" className="display mb-3 text-2xl">Posiciones</h2>
            <div className="card table-wrap">
              <table className="table" data-testid="positions-table">
                <thead><tr><th>Bono</th><th className="r">Títulos</th><th className="r">Precio</th><th className="r">Valor de mercado</th><th className="r">G/P</th></tr></thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr key={r.holding.bondId.toHexString()} data-testid="position-row" data-bond={r.holding.bond.code}>
                      <td><Link className="font-semibold underline decoration-gilt underline-offset-4" href={`/investor/bonds/${r.holding.bondId}`}>{r.holding.bond.name}</Link><div className="hint">{r.holding.issuer.name} · {r.holding.issuer.rating}</div></td>
                      <td className="num r">{r.holding.units.toLocaleString('es-MX')}</td>
                      <td className="num r">{formatPrice(priceOf(r.holding.bond))}</td>
                      <td className="num r">{formatMoney(r.marketValueCents)}</td>
                      <td className={`num r ${signed(r.pnlCents) ?? ''}`}>{formatMoney(r.pnlCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label="Distribución de la cartera" className="card card-pad grid gap-8 sm:grid-cols-3">
            <DistBars title="Por rating" slices={p.byRating} />
            <DistBars title="Por sector" slices={p.bySector} />
            <DistBars title="Por plazo" slices={p.byTerm.map((s) => ({ ...s, key: ({ short: 'Corto', medium: 'Medio', long: 'Largo' } as Record<string, string>)[s.key] ?? s.key }))} />
          </section>
        </div>

        <section aria-labelledby="coupons" className="xl:sticky xl:top-6 xl:self-start">
          <h2 id="coupons" className="display mb-3 text-2xl">Próximos cobros</h2>
          {p.upcoming.length === 0 ? (
            <Empty title="Sin cobros programados" />
          ) : (
            <ol className="space-y-2" data-testid="upcoming-list">
              {p.upcoming.map((u) => (
                <li key={u._id.toHexString()} className="coupon" data-testid="upcoming-coupon" data-date={isoDay(u.dueDate)} data-type={u.type}>
                  <div className="px-4 py-3">
                    <p className="text-sm font-semibold">{u.bond?.name}</p>
                    <p className="hint num">{formatDate(u.dueDate)} · {u.type === 'principal' ? 'Principal' : 'Cupón'}</p>
                  </div>
                  <div className="stub flex items-center justify-end"><span className="num text-sm font-medium">{formatMoney(u.amountCents)}</span></div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
