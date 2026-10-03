import { col } from './db';
import { HttpError } from './http';

/** Límite de ventana fija respaldado por Mongo (válido para serverless). */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const rl = await col('rateLimits');
  const now = new Date();
  // Si la ventana expiró, reinicia el contador.
  await rl.deleteOne({ key, expiresAt: { $lte: now } });
  const doc = await rl.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(now.getTime() + windowSeconds * 1000) },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (doc && doc.count > max) {
    throw new HttpError(429, 'Demasiadas solicitudes. Inténtalo más tarde.', 'rate_limited');
  }
}
