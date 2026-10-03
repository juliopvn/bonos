import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import { requirePageRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { plain } from '@/lib/plain';
import { findUserById } from '@/lib/repositories/users';
import { PageHeader } from '@/components/ui';
import { AlertsCenter } from './AlertsCenter';

export const metadata: Metadata = { title: 'Alertas' };
export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const session = await requirePageRole('investor');
  const investorId = new ObjectId(session.sub);
  const [alerts, user] = await Promise.all([
    (await col('alerts')).find({ investorId }).sort({ createdAt: -1 }).limit(100).toArray(),
    findUserById(investorId),
  ]);
  return (
    <>
      <PageHeader eyebrow="Seguimiento" title="Alertas" />
      <AlertsCenter alerts={plain(alerts)} prefs={user!.alertPrefs} />
    </>
  );
}
