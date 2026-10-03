'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useGlobal } from '@/context/GlobalContext';
import { formatBps, formatPrice, percentToBps } from '@/lib/bps';
import { api } from '@/lib/client-api';
import type { BondStatus, CouponType } from '@/lib/types';

interface Props {
  bond: {
    id: string;
    status: BondStatus;
    couponType: CouponType;
    referenceRateBps: number | null;
    marketPriceBps: number | null;
  };
}

export function BondActions({ bond }: Props) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(
    bond.referenceRateBps != null ? formatBps(bond.referenceRateBps).replace('%', '') : '',
  );
  const [price, setPrice] = useState(
    bond.marketPriceBps != null ? formatPrice(bond.marketPriceBps) : '100.00',
  );

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast(label);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'La acción falló', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {bond.status === 'draft' && (
        <button
          className="btn btn-gilt"
          disabled={busy}
          data-testid="open-book"
          onClick={() =>
            run('Bookbuilding abierto', () =>
              api(`/api/admin/bonds/${bond.id}/open`, { method: 'POST' }),
            )
          }
        >
          Abrir bookbuilding
        </button>
      )}
      {bond.couponType === 'floating' && bond.status !== 'matured' && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('Tasa de referencia actualizada', async () => {
              const res = await api<{ recalculated: number }>(
                `/api/admin/bonds/${bond.id}/reference-rate`,
                { method: 'PATCH', body: { referenceRateBps: percentToBps(rate) } },
              );
              toast(`Pagos futuros recalculados: ${res.recalculated}`, 'info');
            });
          }}
        >
          <div className="field">
            <label htmlFor="ref" className="label">
              Tasa de referencia (%)
            </label>
            <input
              id="ref"
              className="input num !w-28"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              data-testid="reference-rate"
            />
          </div>
          <button className="btn btn-ghost" disabled={busy} data-testid="reference-save">
            Actualizar
          </button>
        </form>
      )}
      {(bond.status === 'active' || bond.status === 'allocated') && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('Precio de mercado actualizado', () =>
              api(`/api/admin/bonds/${bond.id}/market-price`, {
                body: { priceBps: percentToBps(price) },
              }),
            );
          }}
        >
          <div className="field">
            <label htmlFor="price" className="label">
              Precio de mercado (% nominal)
            </label>
            <input
              id="price"
              className="input num !w-28"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              data-testid="market-price"
            />
          </div>
          <button className="btn btn-ghost" disabled={busy} data-testid="price-save">
            Actualizar precio
          </button>
        </form>
      )}
    </div>
  );
}
