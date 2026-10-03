import { col } from '../db';
import { ratingsBetween, RATING_SCALE } from '../domain/rating';
import type { z } from 'zod';
import type { screenerSchema } from '../validation';
import { bondLookupStages, type BondWithIssuer } from '../repositories/bonds';

export type ScreenerQuery = z.output<typeof screenerSchema>;

const SORTS: Record<ScreenerQuery['sort'], Record<string, 1 | -1>> = {
  ytm: { ytmBps: 1, name: 1 },
  '-ytm': { ytmBps: -1, name: 1 },
  maturity: { maturityDate: 1, name: 1 },
  '-maturity': { maturityDate: -1, name: 1 },
  rating: { 'issuer.ratingRank': 1, name: 1 },
  name: { name: 1 },
};

/** Screener con filtros combinables, orden y paginación en servidor. */
export async function screenBonds(q: ScreenerQuery) {
  const match: Record<string, unknown> = {
    status: q.status ?? { $in: ['bookbuilding', 'active'] },
  };
  if (q.term) match.term = q.term;
  if (q.couponType) match.couponType = q.couponType;
  if (q.ytmMin != null || q.ytmMax != null) {
    match.ytmBps = {
      ...(q.ytmMin != null && { $gte: q.ytmMin }),
      ...(q.ytmMax != null && { $lte: q.ytmMax }),
    };
  }
  if (q.maturityFrom || q.maturityTo) {
    match.maturityDate = {
      ...(q.maturityFrom && { $gte: q.maturityFrom }),
      ...(q.maturityTo && { $lte: q.maturityTo }),
    };
  }
  const issuerMatch: Record<string, unknown> = {};
  if (q.sector) issuerMatch['issuer.sector'] = q.sector;
  if (q.ratingMin || q.ratingMax) {
    issuerMatch['issuer.rating'] = {
      $in: ratingsBetween(q.ratingMin ?? 'AAA', q.ratingMax ?? 'D'),
    };
  }

  const pipeline = [
    { $match: match },
    ...bondLookupStages,
    { $match: issuerMatch },
    {
      $addFields: {
        'issuer.ratingRank': {
          $indexOfArray: [RATING_SCALE as readonly string[], '$issuer.rating'],
        },
      },
    },
    {
      $facet: {
        items: [
          { $sort: SORTS[q.sort] },
          { $skip: (q.page - 1) * q.pageSize },
          { $limit: q.pageSize },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ];
  const [res] = await (
    await col('bonds')
  )
    .aggregate<{ items: BondWithIssuer[]; total: { n: number }[] }>(pipeline)
    .toArray();
  const total = res?.total[0]?.n ?? 0;
  return {
    items: res?.items ?? [],
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}
