import { timingSafeEqual } from 'node:crypto';
import { getEnv } from './env';
import { HttpError, unauthorized } from './http';
import { parseISODate, startOfUtcDay } from './domain/dates';

/** Autentica una llamada de cron (Authorization: Bearer CRON_SECRET) y resuelve la fecha simulada. */
export function authorizeCron(req: Request): Date {
  const env = getEnv();
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized();
  const date = new URL(req.url).searchParams.get('date');
  if (date) {
    // Simular el paso del tiempo solo se permite fuera de producción o en modo E2E.
    if (env.NODE_ENV === 'production' && !env.E2E_MODE)
      throw new HttpError(400, 'El parámetro date no está permitido');
    return parseISODate(date);
  }
  return startOfUtcDay(new Date());
}
