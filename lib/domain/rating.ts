export const RATING_SCALE = [
  'AAA',
  'AA+',
  'AA',
  'AA-',
  'A+',
  'A',
  'A-',
  'BBB+',
  'BBB',
  'BBB-',
  'BB+',
  'BB',
  'BB-',
  'B+',
  'B',
  'B-',
  'CCC',
  'CC',
  'C',
  'D',
] as const;

export type Rating = (typeof RATING_SCALE)[number];

export const isRating = (r: string): r is Rating => (RATING_SCALE as readonly string[]).includes(r);

/** 0 = mejor calidad (AAA). */
export function ratingRank(r: string): number {
  const i = (RATING_SCALE as readonly string[]).indexOf(r);
  if (i < 0) throw new Error(`Rating desconocido: ${r}`);
  return i;
}

export const isInvestmentGrade = (r: string): boolean => ratingRank(r) <= ratingRank('BBB-');

/** Ratings dentro de [best, worst] (ambos incluidos). */
export function ratingsBetween(best: string, worst: string): Rating[] {
  const lo = ratingRank(best);
  const hi = ratingRank(worst);
  return RATING_SCALE.slice(Math.min(lo, hi), Math.max(lo, hi) + 1);
}
