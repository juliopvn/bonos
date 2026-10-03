import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Guilloche } from '@/components/Guilloche';
import { ScheduleTable } from '@/components/ScheduleTable';
import { BondStatusBadge, RatingBadge, Stat } from '@/components/ui';
import { LineChart, priceChart } from '@/components/charts';
import { formatBps, formatPrice } from '@/lib/bps';
import { col } from '@/lib/db';
import { toISODate } from '@/lib/domain/dates';
import { effectiveRateBps } from '@/lib/domain/schedule';
import { FREQUENCY_LABEL, TERM_LABEL } from '@/lib/domain/term';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { plain } from '@/lib/plain';
import { getBondWithIssuer } from '@/lib/repositories/bonds';
import { idParam } from '@/lib/route-helpers';
import { bondFlows } from '@/lib/services/bonds';
import { listDocuments } from '@/lib/services/documents';
import { BondActions } from './BondActions';
import { ComplianceManager } from './ComplianceManager';

export const metadata: Metadata = { title: 'Emisión' };
export const dynamic = 'force-dynamic';

export default async function BondDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bond = await getBondWithIssuer(idParam(id)).catch(() => null);
  if (!bond) notFound();
  const [docs, covenants, history] = await Promise.all([
    listDocuments(bond._id),
    (await col('covenants')).find({ bondId: bond._id }).toArray(),
    (await col('priceHistory')).find({ bondId: bond._id }).sort({ date: 1 }).toArray(),
  ]);
  const flows = bondFlows(bond).map((f) => ({
    type: f.type,
    dueDate: toISODate(f.dueDate),
    amountCents: f.amountCents,
  }));

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/bonds" className="underline">
          ← Emisiones
        </Link>
      </p>
      <header className="certificate rise p-7">
        <Guilloche size={380} className="pointer-events-none absolute -top-20 -right-16" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">
              {bond.issuer.name} · <span className="num">{bond.code}</span>
            </p>
            <h1 className="display mt-1 text-4xl" data-testid="bond-title">
              {bond.name}
            </h1>
            <div className="mt-3 flex items-center gap-2">
              <BondStatusBadge status={bond.status} />
              <RatingBadge rating={bond.issuer.rating} />
              <span className="badge badge-mute">Plazo {TERM_LABEL[bond.term]}</span>
            </div>
          </div>
          <BondActions
            bond={{
              id: id,
              status: bond.status,
              couponType: bond.couponType,
              referenceRateBps: bond.referenceRateBps,
              marketPriceBps: bond.marketPriceBps,
            }}
          />
        </div>
      </header>

      <div className="rise-2 mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Valor nominal"
          value={formatMoney(bond.nominalCents)}
          sub={`${bond.totalUnits.toLocaleString('es-MX')} títulos`}
        />
        <Stat
          label={bond.couponType === 'fixed' ? 'Cupón fijo' : 'Cupón variable'}
          value={formatBps(effectiveRateBps(bond))}
          sub={
            bond.couponType === 'floating'
              ? `Ref. ${formatBps(bond.referenceRateBps ?? 0)} + ${formatBps(bond.spreadBps ?? 0)}`
              : `${FREQUENCY_LABEL[bond.frequency]} · ${bond.dayCount}`
          }
        />
        <Stat
          label="Vencimiento"
          value={<span className="text-xl">{formatDate(bond.maturityDate)}</span>}
          sub={`Emitido ${formatDate(bond.issueDate)}`}
        />
        <Stat
          label="Precio de mercado"
          value={formatPrice(bond.marketPriceBps ?? 10_000)}
          sub={`YTM ${bond.ytmBps != null ? formatBps(bond.ytmBps) : 'n/d'} · ${bond.finalPriceBps ? `precio final ${formatPrice(bond.finalPriceBps)}` : 'precio indicativo'}`}
        />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-8">
          {bond.status === 'bookbuilding' && (
            <Link href={`/admin/bookbuilding/${id}`} className="btn btn-gilt" data-testid="go-book">
              Ver libro de órdenes en vivo
            </Link>
          )}
          <section aria-labelledby="hist">
            <h2 id="hist" className="display mb-3 text-2xl">
              Precio histórico
            </h2>
            <div className="card card-pad">
              <LineChart
                points={history.map((h) => ({ date: toISODate(h.date), value: h.priceBps }))}
                label="Precio"
                format={priceChart}
                testId="price-chart"
              />
            </div>
          </section>
          <ComplianceManager bondId={id} documents={plain(docs)} covenants={plain(covenants)} />
        </div>
        <section aria-labelledby="cal" className="xl:sticky xl:top-6 xl:self-start">
          <h2 id="cal" className="display mb-3 text-2xl">
            Calendario por título
          </h2>
          <ScheduleTable flows={flows} />
        </section>
      </div>
    </>
  );
}
