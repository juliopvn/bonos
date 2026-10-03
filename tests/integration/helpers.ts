import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll } from 'vitest';
import { closeDb, col } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { parseISODate } from '@/lib/domain/dates';
import { createIssuer } from '@/lib/repositories/issuers';
import { upsertUserOnLogin } from '@/lib/repositories/users';
import { createBond } from '@/lib/services/bonds';
import type { BondDoc, UserDoc } from '@/lib/types';
import { bondSchema } from '@/lib/validation';

const DOCKER_URI = 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true';

/** Toma MONGODB_URI de .env.local si no viene en el entorno (vitest no carga archivos .env). */
function localMongoUri(): string {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('MONGODB_URI='));
    if (line) return line.slice('MONGODB_URI='.length).trim();
  } catch {
    /* sin .env.local */
  }
  return DOCKER_URI;
}

async function dockerMongoAvailable(): Promise<boolean> {
  const client = new MongoClient(localMongoUri(), { serverSelectionTimeoutMS: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * Prepara una base de datos Mongo REAL y aislada por archivo de test (replica set: hay transacciones).
 * Usa el Mongo de docker si está disponible; si no, mongodb-memory-server.
 */
export function setupTestDb() {
  let memory: MongoMemoryReplSet | undefined;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      AUTH_SECRET: 'integration-test-secret-integration-test-secret',
      CRON_SECRET: 'integration-cron',
      MONGODB_DB: `bonds_it_${randomUUID().slice(0, 8)}`,
      MAIL_DRIVER: 'memory',
      STORAGE_DRIVER: 'fs',
      STORAGE_FS_DIR: `.tmp/it-storage-${randomUUID().slice(0, 8)}`,
      ADMIN_EMAILS: 'admin@test.local',
      AUTH_RATE_LIMIT_MAX: '3',
      APP_URL: 'http://localhost:3000',
      E2E_MODE: 'true',
    });
    if (process.env.INTEGRATION_MONGO === 'memory' || !(await dockerMongoAvailable())) {
      memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      process.env.MONGODB_URI = memory.getUri();
    } else {
      process.env.MONGODB_URI = localMongoUri();
    }
    resetEnvCache();
  }, 120_000);

  afterAll(async () => {
    const db = (await import('@/lib/db')).getDb;
    await (await db()).dropDatabase();
    await closeDb();
    await memory?.stop();
    rmSync(process.env.STORAGE_FS_DIR!, { recursive: true, force: true });
  });
}

export const d = parseISODate;

export async function makeUser(
  email: string,
  role: 'admin' | 'investor' = 'investor',
): Promise<UserDoc> {
  const user = await upsertUserOnLogin(email);
  if (user.role !== role) {
    await (await col('users')).updateOne({ _id: user._id }, { $set: { role } });
    return { ...user, role };
  }
  return user;
}

export async function makeIssuer(name: string, rating = 'AA', sector = 'Energía') {
  return createIssuer({ name, sector, country: 'México', rating, agency: 'S&P' });
}

export async function makeBond(
  actor: ObjectId,
  issuerId: ObjectId,
  over: Partial<Record<string, unknown>> = {},
): Promise<BondDoc> {
  const input = bondSchema.parse({
    issuerId: issuerId.toHexString(),
    name: 'Bono de prueba',
    code: `T-${randomUUID().slice(0, 8)}`,
    nominalCents: 100_000,
    couponType: 'fixed',
    couponRateBps: 600,
    frequency: 2,
    dayCount: '30/360',
    issueDate: '2030-01-15',
    maturityDate: '2032-01-15',
    totalUnits: 100,
    ...over,
  });
  return createBond(actor, input);
}

export async function mailTo(to: string) {
  return (await col('testMailbox')).find({ to }).toArray();
}
