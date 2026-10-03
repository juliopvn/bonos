import type { Metadata } from 'next';
import Link from 'next/link';
import { col } from '@/lib/db';
import { listBondsWithIssuer } from '@/lib/repositories/bonds';
import { BondStatusBadge, Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Cumplimiento' };
export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const [bonds, docCounts, covenants] = await Promise.all([
    listBondsWithIssuer({ status: { $ne: 'draft' } }),
    (await col('documents')).aggregate<{ _id: unknown; n: number }>([{ $group: { _id: '$bondId', n: { $sum: 1 } } }]).toArray(),
    (await col('covenants')).aggregate<{ _id: { b: unknown; s: string }; n: number }>([{ $group: { _id: { b: '$bondId', s: '$status' }, n: { $sum: 1 } } }]).toArray(),
  ]);
  const docs = (id: unknown) => docCounts.find((d) => String(d._id) === String(id))?.n ?? 0;
  const cov = (id: unknown, s: string) => covenants.find((c) => String(c._id.b) === String(id) && c._id.s === s)?.n ?? 0;
  return (
    <>
      <PageHeader eyebrow="Reportes" title="Cumplimiento" />
      {bonds.length === 0 ? (
        <Empty title="Sin emisiones que revisar">Cuando haya emisiones abiertas verás aquí sus documentos y covenants.</Empty>
      ) : (
        <div className="card table-wrap rise-2">
          <table className="table" data-testid="compliance-table">
            <thead><tr><th>Emisión</th><th>Estado</th><th className="r">Documentos</th><th className="r">Covenants OK</th><th className="r">Incumplimientos</th><th /></tr></thead>
            <tbody>
              {bonds.map((b) => (
                <tr key={b._id.toHexString()}>
                  <td className="font-semibold">{b.name}<div className="hint">{b.issuer.name}</div></td>
                  <td><BondStatusBadge status={b.status} /></td>
                  <td className="num r">{docs(b._id)}</td>
                  <td className="num r">{cov(b._id, 'ok')}</td>
                  <td className={`num r ${cov(b._id, 'breach') ? 'neg font-semibold' : ''}`}>{cov(b._id, 'breach')}</td>
                  <td className="r"><Link href={`/admin/bonds/${b._id}`} className="btn btn-ghost btn-sm">Gestionar</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
