import { MongoClient, type Collection, type Db } from 'mongodb';
import { getEnv } from './env';
import type * as T from './types';

type Collections = {
  users: T.UserDoc;
  magicLinks: T.MagicLinkDoc;
  issuers: T.IssuerDoc;
  bonds: T.BondDoc;
  priceHistory: T.PriceHistoryDoc;
  orders: T.OrderDoc;
  positions: T.PositionDoc;
  scheduledPayments: T.ScheduledPaymentDoc;
  documents: T.DocumentDoc;
  covenants: T.CovenantDoc;
  alerts: T.AlertDoc;
  auditLog: T.AuditLogDoc;
  testMailbox: T.TestMailDoc;
  rateLimits: T.RateLimitDoc;
};

// Reutiliza el cliente entre hot-reloads (dev) e invocaciones calientes (serverless).
const g = globalThis as unknown as {
  __mongo?: { client: MongoClient; indexes?: Promise<void> };
};

function getClient(): MongoClient {
  if (!g.__mongo) {
    const env = getEnv();
    g.__mongo = {
      client: new MongoClient(env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 }),
    };
  }
  return g.__mongo.client;
}

export async function getDb(): Promise<Db> {
  const env = getEnv();
  const client = getClient();
  const db = client.db(env.MONGODB_DB);
  const state = g.__mongo!;
  // En producción los índices se crean con `pnpm db:indexes`; en el resto, de forma perezosa.
  if (!state.indexes && (env.NODE_ENV !== 'production' || env.E2E_MODE)) {
    state.indexes = ensureIndexes(db);
  }
  if (state.indexes) await state.indexes;
  return db;
}

export async function col<K extends keyof Collections>(
  name: K,
): Promise<Collection<Collections[K]>> {
  const db = await getDb();
  return db.collection<Collections[K]>(name);
}

/** Crea los índices de forma idempotente. */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('magicLinks').createIndex({ jti: 1 }, { unique: true }),
    db.collection('magicLinks').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('issuers').createIndex({ name: 1 }, { unique: true }),
    db.collection('bonds').createIndex({ code: 1 }, { unique: true }),
    db.collection('bonds').createIndex({ status: 1, maturityDate: 1 }),
    db.collection('bonds').createIndex({ issuerId: 1 }),
    db.collection('priceHistory').createIndex({ bondId: 1, date: 1 }, { unique: true }),
    db.collection('orders').createIndex({ bondId: 1, status: 1 }),
    db.collection('orders').createIndex({ investorId: 1, createdAt: -1 }),
    db.collection('positions').createIndex({ investorId: 1, bondId: 1 }, { unique: true }),
    db.collection('positions').createIndex({ bondId: 1 }),
    db.collection('scheduledPayments').createIndex({ status: 1, dueDate: 1 }),
    db.collection('scheduledPayments').createIndex({ investorId: 1, status: 1, dueDate: 1 }),
    db.collection('scheduledPayments').createIndex({ bondId: 1 }),
    db
      .collection('scheduledPayments')
      .createIndex({ bondId: 1, investorId: 1, type: 1, dueDate: 1 }, { unique: true }),
    db.collection('documents').createIndex({ bondId: 1, createdAt: -1 }),
    db.collection('covenants').createIndex({ bondId: 1 }),
    db.collection('alerts').createIndex({ investorId: 1, createdAt: -1 }),
    db.collection('alerts').createIndex({ investorId: 1, dedupeKey: 1 }, { unique: true }),
    db.collection('auditLog').createIndex({ entity: 1, entityId: 1, createdAt: -1 }),
    db.collection('testMailbox').createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }),
    db.collection('rateLimits').createIndex({ key: 1 }, { unique: true }),
    db.collection('rateLimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export async function pingDb(): Promise<void> {
  const db = await getDb();
  await db.command({ ping: 1 });
}

/** Cierra el cliente (scripts y tests). */
export async function closeDb(): Promise<void> {
  if (g.__mongo) {
    await g.__mongo.client.close();
    g.__mongo = undefined;
  }
}

/** Cliente para transacciones (adjudicación, compras). */
export function getMongoClient(): MongoClient {
  return getClient();
}
