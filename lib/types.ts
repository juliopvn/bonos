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

export interface AlertPrefs {
  priceMoveBps: number;
  concentrationPct: number;
  email: boolean;
}

export interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
  alertPrefs: AlertPrefs;
}

export interface MagicLinkDoc {
  _id: ObjectId;
  jti: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface RatingEntry {
  rating: string;
  date: Date;
  agency: string;
}

export interface IssuerDoc {
  _id: ObjectId;
  name: string;
  sector: string;
  country: string;
  rating: string;
  ratingHistory: RatingEntry[];
  createdAt: Date;
}

export interface BondDoc {
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
}

export interface PriceHistoryDoc {
  _id: ObjectId;
  bondId: ObjectId;
  date: Date;
  priceBps: number;
  ytmBps: number;
}

export interface OrderDoc {
  _id: ObjectId;
  bondId: ObjectId;
  investorId: ObjectId;
  units: number;
  limitPriceBps: number;
  status: OrderStatus;
  allocatedUnits: number;
  createdAt: Date;
}

export interface PositionDoc {
  _id: ObjectId;
  investorId: ObjectId;
  bondId: ObjectId;
  units: number;
  avgCostBps: number;
  acquiredAt: Date;
}

export interface ScheduledPaymentDoc {
  _id: ObjectId;
  bondId: ObjectId;
  investorId: ObjectId;
  type: PaymentType;
  dueDate: Date;
  amountCents: number;
  status: PaymentStatus;
  paidAt: Date | null;
}

export interface DocumentDoc {
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
}

export interface CovenantDoc {
  _id: ObjectId;
  bondId: ObjectId;
  description: string;
  metric: string;
  threshold: string;
  status: 'ok' | 'breach';
  lastCheckedAt: Date;
}

export interface AlertDoc {
  _id: ObjectId;
  investorId: ObjectId;
  type: AlertType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  readAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
}

export interface AuditLogDoc {
  _id: ObjectId;
  actorId: ObjectId | null;
  action: string;
  entity: string;
  entityId: string;
  diff: Record<string, unknown>;
  createdAt: Date;
}

export interface TestMailDoc {
  _id: ObjectId;
  to: string;
  subject: string;
  html: string;
  text: string;
  createdAt: Date;
}

export interface RateLimitDoc {
  _id: ObjectId;
  key: string;
  count: number;
  expiresAt: Date;
}

export interface JobStateDoc {
  _id: ObjectId;
  key: string;
  value: unknown;
}
