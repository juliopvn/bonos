'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OrderStatusBadge } from '@/components/ui';
import { useGlobal } from '@/context/GlobalContext';
import { formatPrice } from '@/lib/bps';
import { api } from '@/lib/client-api';
import { formatDateTime } from '@/lib/format';
import type { Plain } from '@/lib/plain';
import type { OrderDoc } from '@/lib/types';

type Row = Plain<OrderDoc> & { bondName: string; bookOpen: boolean };

export function OrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    try {
      await api(`/api/orders/${id}`, { method: 'DELETE' });
      toast('Orden cancelada');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cancelar', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card table-wrap rise-2">
      <table className="table" data-testid="orders-table">
        <thead>
          <tr>
            <th>Bono</th>
            <th className="r">Títulos</th>
            <th className="r">Precio límite</th>
            <th className="r">Adjudicados</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o._id} data-testid="order-row" data-status={o.status}>
              <td className="font-semibold">{o.bondName}</td>
              <td className="num r">{o.units.toLocaleString('es-MX')}</td>
              <td className="num r">{formatPrice(o.limitPriceBps)}</td>
              <td className="num r">{o.allocatedUnits.toLocaleString('es-MX')}</td>
              <td>
                <OrderStatusBadge status={o.status} />
              </td>
              <td className="num">{formatDateTime(o.createdAt)}</td>
              <td className="r">
                {o.status === 'pending' && o.bookOpen && (
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={busy === o._id}
                    onClick={() => cancel(o._id)}
                    data-testid="cancel-order"
                  >
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
