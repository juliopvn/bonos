import type { Metadata } from 'next';
import Link from 'next/link';
import { Empty, PageHeader, RatingBadge, BondStatusBadge } from '@/components/ui';
import { formatBps, formatPrice } from '@/lib/bps';
import { RATING_SCALE } from '@/lib/domain/rating';
import { TERM_LABEL } from '@/lib/domain/term';
import { formatDate } from '@/lib/format';
import { listSectors } from '@/lib/repositories/issuers';
import { screenBonds } from '@/lib/services/screener';
import { screenerSchema } from '@/lib/validation';
import { ScreenerFilters } from './ScreenerFilters';

export const metadata: Metadata = { title: 'Screener' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

export default async function ScreenerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const clean = Object.fromEntries(Object.entries(sp).filter(([, v]) => v));
  const parsed = screenerSchema.safeParse(clean);
  const query = parsed.success ? parsed.data : screenerSchema.parse({});
  const [result, sectors] = await Promise.all([screenBonds(query), listSectors()]);

  const href = (patch: SP) => {
    const q = new URLSearchParams({
      ...(clean as Record<string, string>),
      ...(patch as Record<string, string>),
    });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/investor/screener?${q}`;
  };
  const sortLink = (key: 'ytm' | 'maturity' | 'rating', label: string) => {
    const current = query.sort;
    const next = current === key ? `-${key}` : key;
    return (
      <Link
        href={href({ sort: next, page: '1' })}
        aria-label={`Ordenar por ${label}`}
        className="underline decoration-dotted"
      >
        {label}
        {current === key ? ' ↑' : current === `-${key}` ? ' ↓' : ''}
      </Link>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Mercado primario y secundario" title="Screener de bonos" />
      {!parsed.success && (
        <p role="alert" className="field-error mb-4">
          Algún filtro no era válido y se ignoró.
        </p>
      )}
      <ScreenerFilters sectors={sectors} ratings={[...RATING_SCALE]} initial={clean} />

      <p className="muted mt-6 mb-3 text-sm" data-testid="screener-count" aria-live="polite">
        {result.total} {result.total === 1 ? 'bono encontrado' : 'bonos encontrados'}
      </p>
      {result.items.length === 0 ? (
        <Empty title="Ningún bono cumple esos filtros">
          Amplía el rango de rating o de rendimiento, o quita el filtro de sector.
        </Empty>
      ) : (
        <div className="card table-wrap rise-2">
          <table className="table" data-testid="screener-table">
            <thead>
              <tr>
                <th>Bono</th>
                <th>{sortLink('rating', 'Rating')}</th>
                <th>Sector</th>
                <th className="r">{sortLink('ytm', 'YTM')}</th>
                <th className="r">Precio</th>
                <th>Cupón</th>
                <th>{sortLink('maturity', 'Vence')}</th>
                <th>Plazo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((b) => (
                <tr
                  key={b._id.toHexString()}
                  data-testid="screener-row"
                  data-code={b.code}
                  data-rating={b.issuer.rating}
                  data-sector={b.issuer.sector}
                >
                  <td>
                    <Link
                      className="font-semibold underline decoration-gilt underline-offset-4"
                      href={`/investor/bonds/${b._id}`}
                      data-testid={`bond-link-${b.code}`}
                    >
                      {b.name}
                    </Link>
                    <div className="hint">
                      {b.issuer.name} · <span className="num">{b.code}</span>
                    </div>
                  </td>
                  <td>
                    <RatingBadge rating={b.issuer.rating} />
                  </td>
                  <td>{b.issuer.sector}</td>
                  <td className="num r font-medium" data-testid="row-ytm">
                    {b.ytmBps != null ? formatBps(b.ytmBps) : '—'}
                  </td>
                  <td className="num r">{formatPrice(b.marketPriceBps ?? 10_000)}</td>
                  <td>{b.couponType === 'fixed' ? 'Fijo' : 'Variable'}</td>
                  <td className="num">{formatDate(b.maturityDate)}</td>
                  <td>{TERM_LABEL[b.term]}</td>
                  <td>
                    <BondStatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.pages > 1 && (
        <nav aria-label="Paginación" className="mt-4 flex items-center justify-between">
          <Link
            aria-disabled={result.page <= 1}
            className={`btn btn-ghost btn-sm ${result.page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
            href={href({ page: String(result.page - 1) })}
          >
            ← Anterior
          </Link>
          <span className="num text-sm">
            Página {result.page} de {result.pages}
          </span>
          <Link
            aria-disabled={result.page >= result.pages}
            className={`btn btn-ghost btn-sm ${result.page >= result.pages ? 'pointer-events-none opacity-40' : ''}`}
            href={href({ page: String(result.page + 1) })}
            data-testid="next-page"
          >
            Siguiente →
          </Link>
        </nav>
      )}
    </>
  );
}
