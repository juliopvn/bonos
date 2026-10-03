import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Guilloche } from '@/components/Guilloche';
import { ScheduleTable } from '@/components/ScheduleTable';
import { BondStatusBadge, RatingBadge, Stat } from '@/components/ui';
import { LineChart, priceChart } from '@/components/charts';
import { requirePageRole } from '@/lib/auth/guards';
import { formatBps, formatPrice } from '@/lib/bps';
import { col } from '@/lib/db';
import { toISODate } from '@/lib/domain/dates';
import { effectiveRateBps } from '@/lib/domain/schedule';
import { FREQUENCY_LABEL, TERM_LABEL } from '@/lib/domain/term';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { getBondWithIssuer } from '@/lib/repositories/bonds';
import { idParam } from '@/lib/route-helpers';
import { bondFlows } from '@/lib/services/bonds';
import { BuyPanel } from './BuyPanel';

export const metadata: Metadata = { title: 'Detalle del bono' };
export const dynamic = 'force-dynamic';

export default async function InvestorBond({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageRole('investor');
  const { id } = await params;
  const bond = await getBondWithIssuer(idParam(id)).catch(() => null);
  if (!bond || bond.status === 'draft') notFound();
  const investorId = new ObjectId(session.sub);
  const [history, position] = await Promise.all([
    (await col('priceHistory')).find({ bondId: bond._id }).sort({ date: 1 }).toArray(),
    (await col('positions')).findOne({ bondId: bond._id, investorId, units: { $gt: 0 } }),
  ]);
  const flows = bondFlows(bond).map((f) => ({
    type: f.type,
    dueDate: toISODate(f.dueDate),
    amountCents: f.amountCents,
  }));

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/investor/screener" className="underline">
          ← Screener
        </Link>
      </p>
      <header className="certificate rise p-7">
        <Guilloche size={380} className="pointer-events-none absolute -top-20 -right-16" />
        <div className="relative">
          <p className="eyebrow">
            {bond.issuer.name} · {bond.issuer.sector}
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
      </header>

      <div className="rise-2 mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="YTM actual"
          value={
            <span data-testid="bond-ytm">
              {bond.ytmBps != null ? formatBps(bond.ytmBps) : 'n/d'}
            </span>
          }
          sub={`Precio ${formatPrice(bond.marketPriceBps ?? 10_000)}% del nominal`}
        />
        <Stat
          label={bond.couponType === 'fixed' ? 'Cupón fijo' : 'Cupón variable'}
          value={formatBps(effectiveRateBps(bond))}
          sub={`${FREQUENCY_LABEL[bond.frequency]} · ${bond.dayCount}`}
        />
        <Stat label="Nominal por título" value={formatMoney(bond.nominalCents)} />
        <Stat
          label="Vencimiento"
          value={<span className="text-lg">{formatDate(bond.maturityDate)}</span>}
          sub={`Emitido ${formatDate(bond.issueDate)}`}
        />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-8">
          <BuyPanel
            bond={{
              id,
              status: bond.status,
              nominalCents: bond.nominalCents,
              priceBps: bond.marketPriceBps ?? 10_000,
              available: bond.availableUnits,
            }}
            holding={position ? position.units : 0}
          />
          <section aria-labelledby="hist" className="card card-pad">
            <h2 id="hist" className="display mb-3 text-2xl">
              Precio histórico
            </h2>
            <LineChart
              points={history.map((h) => ({ date: toISODate(h.date), value: h.priceBps }))}
              label="Precio del bono"
              format={priceChart}
              testId="price-chart"
            />
          </section>
          <section aria-labelledby="rating" className="card card-pad">
            <h2 id="rating" className="display mb-3 text-2xl">
              Rating del emisor
            </h2>
            <ol className="space-y-2 text-sm">
              {[...bond.issuer.ratingHistory].reverse().map((h, i) => (
                <li key={i} className="flex items-center gap-3">
                  <RatingBadge rating={h.rating} />
                  <span className="num">{formatDate(h.date)}</span>
                  <span className="hint">{h.agency}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <section aria-labelledby="cal" className="xl:sticky xl:top-6 xl:self-start">
          <h2 id="cal" className="display mb-3 text-2xl">
            Flujos por título
          </h2>
          <ScheduleTable flows={flows} />
        </section>
      </div>
    </>
  );
}
