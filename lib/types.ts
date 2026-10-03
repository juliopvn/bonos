import type { ObjectId } from 'mongodb';

export type Role = 'admin' | 'investor';
export type CouponType = 'fixed' | 'floating';
export type Frequency = 12 | 4 | 2 | 1;
export type DayCount = '30/360' | 'ACT/360' | 'ACT/365';
export type Term = 'short' | 'medium' | 'long';
export type BondStatus = 'draft' | 'bookbuilding' | 'allocated' | 'active' | 'matured';
export type OrderStatus = 'pending' | 'allocated' | 'partial' | 'rejected' | 'cancelled';
export type PaymentType = 'coupon' | 'principal';
export type PaymentStatus = 'scheduled' | 'paid';
export type DocumentKind = 'fiscal' | 'use_of_funds' | 'covenant' | 'report';
export type AlertType = 'rating_change' | 'price_move' | 'rebalance' | 'payment';

export type AlertPrefs = {
  priceMoveBps: number;
  concentrationPct: number;
  email: boolean;
};

export type UserDoc = {
  _id: ObjectId;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  alertPrefs: AlertPrefs;
};

export type MagicLinkDoc = {
  _id: ObjectId;
  jti: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type RatingEntry = {
  rating: string;
  date: Date;
  agency: string;
};

export type IssuerDoc = {
  _id: ObjectId;
  name: string;
  sector: string;
  country: string;
  rating: string;
  ratingHistory: RatingEntry[];
  createdAt: Date;
};

export type BondDoc = {
  _id: ObjectId;
  issuerId: ObjectId;
  name: string;
  code: string;
  nominalCents: number;
  couponType: CouponType;
  couponRateBps: number | null;
  referenceRateBps: number | null;
  spreadBps: number | null;
  frequency: Frequency;
  dayCount: DayCount;
  issueDate: Date;
  maturityDate: Date;
  term: Term;
  status: BondStatus;
  totalUnits: number;
  /** Títulos disponibles en el mercado secundario simulado (inventario). */
  availableUnits: number;
  finalPriceBps: number | null;
  marketPriceBps: number | null;
  ytmBps: number | null;
  createdAt: Date;
};

export type PriceHistoryDoc = {
  _id: ObjectId;
  bondId: ObjectId;
  date: Date;
  priceBps: number;
  ytmBps: number;
};

export type OrderDoc = {
  _id: ObjectId;
  bondId: ObjectId;
  investorId: ObjectId;
  units: number;
  limitPriceBps: number;
  status: OrderStatus;
  allocatedUnits: number;
  createdAt: Date;
};

export type PositionDoc = {
  _id: ObjectId;
  investorId: ObjectId;
  bondId: ObjectId;
  units: number;
  avgCostBps: number;
  acquiredAt: Date;
};

export type ScheduledPaymentDoc = {
  _id: ObjectId;
  bondId: ObjectId;
  investorId: ObjectId;
  type: PaymentType;
  dueDate: Date;
  amountCents: number;
  status: PaymentStatus;
  paidAt: Date | null;
};

export type DocumentDoc = {
  _id: ObjectId;
  bondId: ObjectId | null;
  issuerId: ObjectId | null;
  kind: DocumentKind;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: ObjectId;
  createdAt: Date;
};

export type CovenantDoc = {
  _id: ObjectId;
  bondId: ObjectId;
  description: string;
  metric: string;
  threshold: string;
  status: 'ok' | 'breach';
  lastCheckedAt: Date;
};

export type AlertDoc = {
  _id: ObjectId;
  investorId: ObjectId;
  type: AlertType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  readAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
};

export type AuditLogDoc = {
  _id: ObjectId;
  actorId: ObjectId | null;
  action: string;
  entity: string;
  entityId: string;
  diff: Record<string, unknown>;
  createdAt: Date;
};

export type TestMailDoc = {
  _id: ObjectId;
  to: string;
  subject: string;
  html: string;
  text: string;
  createdAt: Date;
};

export type RateLimitDoc = {
  _id: ObjectId;
  key: string;
  count: number;
  expiresAt: Date;
};
