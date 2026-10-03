import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { RATING_SCALE } from '../domain/rating';

export const objectId = z
  .string()
  .refine((v) => ObjectId.isValid(v) && v.length === 24, 'Identificador inválido')
  .transform((v) => new ObjectId(v));

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Correo electrónico inválido'));

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato AAAA-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Fecha inválida');

export const rating = z.enum(RATING_SCALE);
export const frequency = z.union([z.literal(12), z.literal(4), z.literal(2), z.literal(1)]);
export const dayCount = z.enum(['30/360', 'ACT/360', 'ACT/365']);

export const bps = (min = 0, max = 100_000) => z.number().int().min(min).max(max);
export const priceBps = z.number().int().min(1_000).max(30_000);

export const loginRequestSchema = z.object({ email });

export const issuerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sector: z.string().trim().min(2).max(60),
  country: z.string().trim().min(2).max(60).default('México'),
  rating,
  agency: z.string().trim().min(1).max(40).default('S&P'),
});

export const ratingChangeSchema = z.object({
  rating,
  agency: z.string().trim().min(1).max(40).default('S&P'),
});

const bondBase = z.object({
  issuerId: objectId,
  name: z.string().trim().min(3).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,24}$/, 'Código: 4-24 caracteres A-Z, 0-9 o guion'),
  nominalCents: z.number().int().min(10_000).max(100_000_000_00),
  couponType: z.enum(['fixed', 'floating']),
  couponRateBps: bps(0, 5_000).nullable().optional(),
  referenceRateBps: bps(0, 5_000).nullable().optional(),
  spreadBps: bps(0, 5_000).nullable().optional(),
  frequency,
  dayCount: dayCount.default('30/360'),
  issueDate: isoDate,
  maturityDate: isoDate,
  totalUnits: z.number().int().min(1).max(10_000_000),
});

export const bondSchema = bondBase.superRefine((b, ctx) => {
  if (b.maturityDate <= b.issueDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['maturityDate'],
      message: 'El vencimiento debe ser posterior a la emisión',
    });
  }
  if (b.couponType === 'fixed' && b.couponRateBps == null) {
    ctx.addIssue({ code: 'custom', path: ['couponRateBps'], message: 'Indica la tasa de cupón' });
  }
  if (b.couponType === 'floating' && (b.referenceRateBps == null || b.spreadBps == null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['referenceRateBps'],
      message: 'Indica tasa de referencia y spread',
    });
  }
});

export const previewSchema = bondBase.pick({
  nominalCents: true,
  couponType: true,
  couponRateBps: true,
  referenceRateBps: true,
  spreadBps: true,
  frequency: true,
  dayCount: true,
  issueDate: true,
  maturityDate: true,
});

export const orderSchema = z.object({
  bondId: objectId,
  units: z.number().int().min(1).max(1_000_000),
  limitPriceBps: priceBps,
});

export const closeBookSchema = z.object({ finalPriceBps: priceBps });
export const referenceRateSchema = z.object({ referenceRateBps: bps(0, 5_000) });
export const marketPriceSchema = z.object({ priceBps });
export const buySchema = z.object({
  bondId: objectId,
  units: z.number().int().min(1).max(1_000_000),
});

export const covenantSchema = z.object({
  description: z.string().trim().min(3).max(300),
  metric: z.string().trim().min(2).max(80),
  threshold: z.string().trim().min(1).max(80),
});
export const covenantStatusSchema = z.object({ status: z.enum(['ok', 'breach']) });

export const alertPrefsSchema = z.object({
  priceMoveBps: z.number().int().min(10).max(5_000),
  concentrationPct: z.number().int().min(5).max(100),
  email: z.boolean(),
});

export const documentKinds = ['fiscal', 'use_of_funds', 'covenant', 'report'] as const;
export const documentKind = z.enum(documentKinds);

export const screenerSchema = z.object({
  ratingMin: z.enum(RATING_SCALE).optional(),
  ratingMax: z.enum(RATING_SCALE).optional(),
  ytmMin: z.coerce.number().int().optional(),
  ytmMax: z.coerce.number().int().optional(),
  term: z.enum(['short', 'medium', 'long']).optional(),
  maturityFrom: isoDate.optional(),
  maturityTo: isoDate.optional(),
  sector: z.string().max(60).optional(),
  couponType: z.enum(['fixed', 'floating']).optional(),
  status: z.enum(['bookbuilding', 'active']).optional(),
  sort: z.enum(['ytm', '-ytm', 'maturity', '-maturity', 'rating', 'name']).default('-ytm'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
