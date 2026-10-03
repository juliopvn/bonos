'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGlobal } from '@/context/GlobalContext';
import { api } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import type { Plain } from '@/lib/plain';
import type { CovenantDoc, DocumentDoc } from '@/lib/types';

const KIND_LABEL: Record<string, string> = {
  fiscal: 'Fiscal',
  use_of_funds: 'Uso de fondos',
  covenant: 'Covenant',
  report: 'Reporte',
};

export function ComplianceManager({
  bondId,
  documents,
  covenants,
}: {
  bondId: string;
  documents: Plain<DocumentDoc>[];
  covenants: Plain<CovenantDoc>[];
}) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [busy, setBusy] = useState(false);

  async function act(okMsg: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast(okMsg);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'La acción falló', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="compliance" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="compliance" className="display text-2xl">
          Cumplimiento y reportes
        </h2>
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy}
          data-testid="generate-report"
          onClick={() =>
            act('Reporte generado', () =>
              api(`/api/admin/bonds/${bondId}/report`, { method: 'POST' }),
            )
          }
        >
          Generar reporte CSV
        </button>
      </div>

      <div className="card card-pad">
        <h3 className="label mb-3 uppercase">Documentos</h3>
        {documents.length === 0 ? (
          <p className="muted text-sm" data-testid="docs-empty">
            Aún no hay documentos. Sube el primero: fiscal, uso de fondos, covenants o reportes.
          </p>
        ) : (
          <ul className="divide-y divide-line" data-testid="docs-list">
            {documents.map((d) => (
              <li
                key={d._id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
                data-testid="doc-row"
              >
                <span>
                  <span className="badge badge-info mr-2">{KIND_LABEL[d.kind]}</span>
                  {d.fileName}
                  <span className="hint ml-2">{formatDate(d.createdAt)}</span>
                </span>
                <a
                  className="btn btn-ghost btn-sm"
                  href={`/api/documents/${d._id}/download`}
                  data-testid="doc-download"
                >
                  Descargar
                </a>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-line pt-4"
          data-testid="upload-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set('bondId', bondId);
            act('Documento subido', async () => {
              await api('/api/admin/documents', { body: fd });
              form.reset();
            });
          }}
        >
          <div className="field">
            <label htmlFor="kind" className="label">
              Tipo
            </label>
            <select id="kind" name="kind" className="input" data-testid="doc-kind">
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="file" className="label">
              Archivo (PDF, CSV, PNG, JPG o XLSX · máx. 5 MB)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              required
              className="input"
              data-testid="doc-file"
              accept=".pdf,.csv,.png,.jpg,.jpeg,.xlsx"
            />
          </div>
          <button className="btn btn-primary" disabled={busy} data-testid="doc-upload">
            Subir
          </button>
        </form>
      </div>

      <div className="card card-pad">
        <h3 className="label mb-3 uppercase">Covenants</h3>
        {covenants.length === 0 ? (
          <p className="muted text-sm">
            Sin covenants. Agrega las condiciones que el emisor debe cumplir.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {covenants.map((c) => (
              <li
                key={c._id}
                className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
                data-testid="covenant-row"
              >
                <span>
                  {c.description}{' '}
                  <span className="hint num">
                    · {c.metric} {c.threshold}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`badge ${c.status === 'ok' ? 'badge-ok' : 'badge-bad'}`}>
                    {c.status === 'ok' ? 'Cumple' : 'Incumple'}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    data-testid="covenant-toggle"
                    onClick={() =>
                      act('Estado actualizado', () =>
                        api(`/api/admin/covenants/${c._id}`, {
                          method: 'PATCH',
                          body: { status: c.status === 'ok' ? 'breach' : 'ok' },
                        }),
                      )
                    }
                  >
                    Marcar {c.status === 'ok' ? 'incumplimiento' : 'cumple'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 grid gap-3 border-t border-dashed border-line pt-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            act('Covenant agregado', async () => {
              await api(`/api/admin/bonds/${bondId}/covenants`, {
                body: {
                  description: fd.get('description'),
                  metric: fd.get('metric'),
                  threshold: fd.get('threshold'),
                },
              });
              form.reset();
            });
          }}
        >
          <div className="field">
            <label className="label" htmlFor="cd">
              Descripción
            </label>
            <input
              id="cd"
              name="description"
              required
              minLength={3}
              className="input"
              data-testid="covenant-desc"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="cm">
              Métrica
            </label>
            <input id="cm" name="metric" required className="input" />
          </div>
          <div className="field">
            <label className="label" htmlFor="ct">
              Umbral
            </label>
            <input id="ct" name="threshold" required className="input" />
          </div>
          <button className="btn btn-ghost" disabled={busy} data-testid="covenant-add">
            Agregar
          </button>
        </form>
      </div>
    </section>
  );
}
