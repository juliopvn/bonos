import type { ObjectId } from 'mongodb';
import { col } from './db';

export async function audit(
  actorId: ObjectId | null,
  action: string,
  entity: string,
  entityId: ObjectId | string,
  diff: Record<string, unknown> = {},
): Promise<void> {
  await (await col('auditLog')).insertOne({
    actorId,
    action,
    entity,
    entityId: String(entityId),
    diff,
    createdAt: new Date(),
  } as never);
}
