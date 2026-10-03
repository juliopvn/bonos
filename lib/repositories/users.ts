import { ObjectId } from 'mongodb';
import { col } from '../db';
import { getEnv } from '../env';
import type { AlertPrefs, Role, UserDoc } from '../types';

export function defaultAlertPrefs(): AlertPrefs {
  const env = getEnv();
  return {
    priceMoveBps: env.ALERT_PRICE_MOVE_BPS,
    concentrationPct: env.ALERT_CONCENTRATION_PCT,
    email: true,
  };
}

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  return (await col('users')).findOne({ email });
}

export async function findUserById(id: string | ObjectId): Promise<UserDoc | null> {
  return (await col('users')).findOne({ _id: new ObjectId(id) });
}

/** Devuelve el usuario; si no existe, lo crea (admin si está en ADMIN_EMAILS, si no investor). */
export async function upsertUserOnLogin(email: string): Promise<UserDoc> {
  const users = await col('users');
  const existing = await users.findOne({ email });
  if (existing) return existing;
  const role: Role = getEnv().ADMIN_EMAILS.includes(email) ? 'admin' : 'investor';
  const doc = {
    _id: new ObjectId(),
    email,
    name: email.split('@')[0],
    role,
    createdAt: new Date(),
    alertPrefs: defaultAlertPrefs(),
  };
  try {
    await users.insertOne(doc);
    return doc;
  } catch {
    // Carrera: otro request lo creó primero.
    return (await users.findOne({ email }))!;
  }
}

export async function listInvestors(): Promise<UserDoc[]> {
  return (await col('users')).find({ role: 'investor' }).sort({ email: 1 }).toArray();
}

export async function updateAlertPrefs(id: ObjectId, prefs: AlertPrefs): Promise<void> {
  await (await col('users')).updateOne({ _id: id }, { $set: { alertPrefs: prefs } });
}
