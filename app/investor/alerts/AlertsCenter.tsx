'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Empty } from '@/components/ui';
import { useGlobal } from '@/context/GlobalContext';
import { api } from '@/lib/client-api';
import { formatDateTime } from '@/lib/format';
import type { Plain } from '@/lib/plain';
import type { AlertDoc, AlertPrefs, AlertType } from '@/lib/types';

const LABEL: Record<AlertType, [string, string]> = {
  rating_change: ['Rating', 'badge-bad'],
  price_move: ['Precio', 'badge-warn'],
  rebalance: ['Rebalanceo', 'badge-info'],
  payment: ['Pago', 'badge-ok'],
};

export function AlertsCenter({ alerts, prefs }: { alerts: Plain<AlertDoc>[]; prefs: AlertPrefs }) {
  const router = useRouter();
  const { toast, refreshAlerts } = useGlobal();
  const [form, setForm] = useState({
    priceMove: String(prefs.priceMoveBps),
    concentration: String(prefs.concentrationPct),
    email: prefs.email,
  });

  async function markRead(ids?: string[]) {
    await api('/api/alerts/read', { body: ids ? { ids } : {} });
    await refreshAlerts();
    router.refresh();
  }

  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/api/alerts/preferences', {
        method: 'PUT',
        body: {
          priceMoveBps: Number(form.priceMove),
          concentrationPct: Number(form.concentration),
          email: form.email,
        },
      });
      toast('Preferencias guardadas');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudieron guardar', 'error');
    }
  }

  const unread = alerts.filter((a) => !a.readAt).length;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Bandeja de alertas" className="rise-2">
        <div className="mb-3 flex items-center justify-between">
          <p className="muted text-sm" data-testid="unread-count">
            {unread} sin leer
          </p>
          <button
            className="btn btn-ghost btn-sm"
            disabled={unread === 0}
            onClick={() => markRead()}
            data-testid="mark-all"
          >
            Marcar todas como leídas
          </button>
        </div>
        {alerts.length === 0 ? (
          <Empty title="Sin alertas por ahora">
            Te avisaremos de cambios de rating, movimientos de precio, pagos y necesidad de
            rebalancear.
          </Empty>
        ) : (
          <ul className="space-y-2" data-testid="alerts-list">
            {alerts.map((a) => {
              const [label, cls] = LABEL[a.type];
              const p = a.payload as { title?: string; detail?: string };
              return (
                <li
                  key={a._id}
                  data-testid="alert-item"
                  data-read={a.readAt ? 'true' : 'false'}
                  className="card flex items-start justify-between gap-4 p-4"
                  style={{ borderLeft: a.readAt ? undefined : '4px solid var(--color-gilt)' }}
                >
                  <div>
                    <p className="flex items-center gap-2">
                      <span className={`badge ${cls}`}>{label}</span>
                      <span className="font-semibold">{p.title}</span>
                    </p>
                    <p className="muted mt-1 text-sm">{p.detail}</p>
                    <p className="hint num mt-1">{formatDateTime(a.createdAt)}</p>
                  </div>
                  {!a.readAt && (
                    <button
                      className="btn btn-ghost btn-sm shrink-0"
                      onClick={() => markRead([a._id])}
                      data-testid="mark-read"
                    >
                      Marcar leída
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form
        onSubmit={savePrefs}
        className="card card-pad rise-3 space-y-4 xl:self-start"
        data-testid="prefs-form"
      >
        <h2 className="display text-2xl">Preferencias</h2>
        <div className="field">
          <label htmlFor="pm" className="label">
            Variación de precio (bps)
          </label>
          <input
            id="pm"
            type="number"
            min={10}
            max={5000}
            className="input num"
            value={form.priceMove}
            onChange={(e) => setForm({ ...form, priceMove: e.target.value })}
            data-testid="pref-price"
          />
          <span className="hint">
            Te avisamos si el precio de un bono tuyo se mueve esta cantidad o más.
          </span>
        </div>
        <div className="field">
          <label htmlFor="cc" className="label">
            Concentración máxima (%)
          </label>
          <input
            id="cc"
            type="number"
            min={5}
            max={100}
            className="input num"
            value={form.concentration}
            onChange={(e) => setForm({ ...form, concentration: e.target.value })}
            data-testid="pref-concentration"
          />
          <span className="hint">Por emisor, sector o plazo.</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.checked })}
            data-testid="pref-email"
          />{' '}
          Recibir también por correo
        </label>
        <button className="btn btn-primary w-full" data-testid="pref-save">
          Guardar preferencias
        </button>
      </form>
    </div>
  );
}
