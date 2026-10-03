import type { ObjectId } from 'mongodb';
import { col } from '../db';

export async function countUnreadAlerts(investorId: ObjectId): Promise<number> {
  return (await col('alerts')).countDocuments({ investorId, readAt: null });
}
