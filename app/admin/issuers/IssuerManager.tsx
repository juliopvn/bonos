'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RatingBadge, Empty } from '@/components/ui';
import { useGlobal } from '@/context/GlobalContext';
import { RATING_SCALE } from '@/lib/domain/rating';
import { api } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import type { Plain } from '@/lib/plain';
import type { IssuerDoc } from '@/lib/types';

type Issuer = Plain<IssuerDoc>;

export function IssuerManager({ issuers }: { issuers: Issuer[] }) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [busy, setBusy] = useState(false);
  const [newRatings, setNewRatings] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await api('/api/admin/issuers', {
        body: {
          name: fd.get('name'),
          sector: fd.get('sector'),
          country: fd.get('country') || 'México',
          rating: fd.get('rating'),
        },
      });
      toast('Emisor creado');
      form.reset();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear el emisor', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeRating(issuer: Issuer) {
    const rating = newRatings[issuer._id] ?? issuer.rating;
    if (rating === issuer.rating) return toast('Elige un rating distinto al actual', 'info');
    try {
      const res = await api<{ alertsCreated: number }>(`/api/admin/issuers/${issuer._id}/rating`, {
        body: { rating },
      });
      toast(`Rating actualizado a ${rating}. Alertas enviadas: ${res.alertsCreated}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cambiar el rating', 'error');
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
      <section aria-label="Listado de emisores" className="rise-2 min-w-0">
        {issuers.length === 0 ? (
          <Empty title="Aún no hay emisores">
            Crea el primero con el formulario para poder estructurar emisiones.
          </Empty>
        ) : (
          <div className="card table-wrap">
            <table className="table" data-testid="issuers-table">
              <thead>
                <tr>
                  <th>Emisor</th>
                  <th>Sector</th>
                  <th>Rating</th>
                  <th>Historial</th>
                  <th>Cambiar rating</th>
                </tr>
              </thead>
              <tbody>
                {issuers.map((i) => (
                  <tr key={i._id} data-testid={`issuer-row-${i.name}`}>
                    <td className="font-semibold">{i.name}</td>
                    <td>{i.sector}</td>
                    <td>
                      <RatingBadge rating={i.rating} />
                    </td>
                    <td className="hint">
                      {i.ratingHistory
                        .slice(-3)
                        .map((h) => `${h.rating} (${formatDate(h.date)})`)
                        .join(' → ')}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Nuevo rating de ${i.name}`}
                          className="input !min-h-8 !w-24 !py-1"
                          value={newRatings[i._id] ?? i.rating}
                          onChange={(e) =>
                            setNewRatings({ ...newRatings, [i._id]: e.target.value })
                          }
                          data-testid={`rating-select-${i.name}`}
                        >
                          {RATING_SCALE.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => changeRating(i)}
                          data-testid={`rating-save-${i.name}`}
                        >
                          Guardar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="new-issuer" className="rise-3">
        <form onSubmit={create} className="card card-pad space-y-4" data-testid="issuer-form">
          <h2 id="new-issuer" className="display text-2xl">
            Nuevo emisor
          </h2>
          <div className="field">
            <label htmlFor="name" className="label">
              Razón social
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              className="input"
              data-testid="issuer-name"
            />
          </div>
          <div className="field">
            <label htmlFor="sector" className="label">
              Sector
            </label>
            <input
              id="sector"
              name="sector"
              required
              minLength={2}
              className="input"
              data-testid="issuer-sector"
              list="sectors"
            />
            <datalist id="sectors">
              {['Energía', 'Financiero', 'Consumo', 'Telecomunicaciones', 'Infraestructura'].map(
                (s) => (
                  <option key={s} value={s} />
                ),
              )}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="rating" className="label">
              Rating inicial
            </label>
            <select
              id="rating"
              name="rating"
              defaultValue="A"
              className="input"
              data-testid="issuer-rating"
            >
              {RATING_SCALE.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary w-full" disabled={busy} data-testid="issuer-submit">
            {busy ? 'Creando…' : 'Crear emisor'}
          </button>
        </form>
      </section>
    </div>
  );
}
