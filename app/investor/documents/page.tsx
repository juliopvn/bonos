import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import { requirePageRole } from '@/lib/auth/guards';
import { formatDate } from '@/lib/format';
import { listDocumentsForInvestor } from '@/lib/services/documents';
import { Empty, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Documentos' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = {
  fiscal: 'Fiscal',
  use_of_funds: 'Uso de fondos',
  covenant: 'Covenant',
  report: 'Reporte',
};

export default async function DocumentsPage() {
  const session = await requirePageRole('investor');
  const docs = await listDocumentsForInvestor(new ObjectId(session.sub));
  return (
    <>
      <PageHeader eyebrow="Cumplimiento" title="Documentos de mis bonos" />
      {docs.length === 0 ? (
        <Empty title="No hay documentos disponibles">
          Verás aquí los documentos fiscales, de uso de fondos y reportes de los bonos que posees.
        </Empty>
      ) : (
        <div className="card table-wrap rise-2">
          <table className="table" data-testid="documents-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Bono</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d._id.toHexString()} data-testid="document-row">
                  <td className="font-semibold">{d.fileName}</td>
                  <td>{d.bond.name}</td>
                  <td>
                    <span className="badge badge-info">{KIND[d.kind]}</span>
                  </td>
                  <td className="num">{formatDate(d.createdAt)}</td>
                  <td className="r">
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/api/documents/${d._id}/download`}
                      data-testid="doc-download"
                    >
                      Descargar
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
