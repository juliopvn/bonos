import { ObjectId } from 'mongodb';
import { requireRole } from '@/lib/auth/guards';
import { ok, route } from '@/lib/http';
import { getPortfolio } from '@/lib/services/portfolio';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const s = await requireRole('investor');
  const p = await getPortfolio(new ObjectId(s.sub));
  return ok({
    marketValueCents: p.marketValueCents,
    costCents: p.costCents,
    pnlCents: p.pnlCents,
    collectedCents: p.collectedCents,
    upcomingCents: p.upcomingCents,
    positions: p.rows.map((r) => ({
      bondId: r.holding.bondId,
      name: r.holding.bond.name,
      units: r.holding.units,
      marketValueCents: r.marketValueCents,
      costCents: r.costCents,
      pnlCents: r.pnlCents,
    })),
    upcoming: p.upcoming,
    byRating: p.byRating,
    bySector: p.bySector,
    byTerm: p.byTerm,
    performance: p.performance,
  });
});
