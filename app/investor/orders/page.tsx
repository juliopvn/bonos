import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import { requirePageRole } from '@/lib/auth/guards';
import { col } from '@/lib/db';
import { bondsByIds } from '@/lib/repositories/bonds';
import { plain } from '@/lib/plain';
import { Empty, PageHeader } from '@/components/ui';
import { OrdersTable } from './OrdersTable';

export const metadata: Metadata = { title: 'Órdenes' };
export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const session = await requirePageRole('investor');
  const orders = await (await col('orders')).find({ investorId: new ObjectId(session.sub) }).sort({ createdAt: -1 }).toArray();
  const bonds = await bondsByIds([...new Set(orders.map((o) => o.bondId.toHexString()))].map((i) => new ObjectId(i)));
  const rows = orders.map((o) => ({
    ...plain(o),
    bondName: bonds.get(o.bondId.toHexString())?.name ?? 'Bono',
    bookOpen: bonds.get(o.bondId.toHexString())?.status === 'bookbuilding',
  }));
  return (
    <>
      <PageHeader eyebrow="Mercado primario" title="Mis órdenes" />
      {rows.length === 0 ? <Empty title="Todavía no has colocado órdenes">Cuando una emisión abra su libro, podrás ofertar títulos con un precio límite.</Empty> : <OrdersTable rows={rows} />}
    </>
  );
}
