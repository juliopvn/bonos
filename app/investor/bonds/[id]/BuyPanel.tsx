'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useGlobal } from '@/context/GlobalContext';
import { formatPrice, percentToBps } from '@/lib/bps';
import { api } from '@/lib/client-api';
import { marketValueCents } from '@/lib/domain/valuation';
import { formatMoney } from '@/lib/money';
import type { BondStatus } from '@/lib/types';

interface Props {
  bond: {
    id: string;
    status: BondStatus;
    nominalCents: number;
    priceBps: number;
    available: number;
  };
  holding: number;
}

export function BuyPanel({ bond, holding }: Props) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [units, setUnits] = useState('10');
  const [limit, setLimit] = useState(formatPrice(bond.priceBps));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const n = Number(units);
  const validUnits = Number.isInteger(n) && n > 0;
  const price = useMemo(() => {
    if (bond.status === 'bookbuilding') {
      try {
        return percentToBps(limit);
      } catch {
        return null;
      }
    }
    return bond.priceBps;
  }, [bond, limit]);
  const amount = validUnits && price ? marketValueCents(n, bond.nominalCents, price) : null;

  async function submit() {
    if (!validUnits || !price) return;
    setBusy(true);
    try {
      if (bond.status === 'bookbuilding') {
        await api('/api/orders', { body: { bondId: bond.id, units: n, limitPriceBps: price } });
        toast('Orden colocada en el libro');
        router.push('/investor/orders');
      } else {
        await api('/api/portfolio/buy', { body: { bondId: bond.id, units: n } });
        toast(`Compra realizada: ${n} títulos`);
        router.push('/investor');
      }
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar la operación', 'error');
      setBusy(false);
      setConfirming(false);
    }
  }

  if (bond.status !== 'bookbuilding' && bond.status !== 'active') {
    return (
      <section className="card card-pad" aria-label="Compra">
        <p className="display text-2xl">No disponible para compra</p>
        <p className="muted mt-1 text-sm">
          Este bono está {bond.status === 'matured' ? 'vencido' : 'adjudicado y aún no cotiza'}.
        </p>
      </section>
    );
  }

  return (
    <section className="coupon" aria-labelledby="buy-title" data-testid="buy-panel">
      <div className="p-6">
        <p className="eyebrow">
          {bond.status === 'bookbuilding' ? 'Oferta primaria' : 'Mercado secundario'}
        </p>
        <h2 id="buy-title" className="display mt-1 text-2xl">
          {bond.status === 'bookbuilding' ? 'Colocar orden' : 'Comprar'}
        </h2>
        {holding > 0 && (
          <p className="hint mt-1" data-testid="holding">
            Ya tienes {holding.toLocaleString('es-MX')} títulos de este bono.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="field">
            <label htmlFor="units" className="label">
              Títulos
            </label>
            <input
              id="units"
              type="number"
              min={1}
              step={1}
              className="input num !w-32"
              value={units}
              onChange={(e) => {
                setUnits(e.target.value);
                setConfirming(false);
              }}
              data-testid="buy-units"
            />
          </div>
          {bond.status === 'bookbuilding' && (
            <div className="field">
              <label htmlFor="limit" className="label">
                Precio límite (% nominal)
              </label>
              <input
                id="limit"
                className="input num !w-36"
                inputMode="decimal"
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value);
                  setConfirming(false);
                }}
                data-testid="buy-limit"
              />
            </div>
          )}
        </div>
        <p className="num mt-4 text-sm" data-testid="buy-total">
          {amount != null ? (
            <>
              Importe estimado: <strong>{formatMoney(amount)}</strong> a {formatPrice(price!)}% del
              nominal
            </>
          ) : (
            'Indica títulos enteros y un precio válido.'
          )}
        </p>
        {bond.status === 'active' && (
          <p className="hint mt-1">
            Disponibles: {bond.available.toLocaleString('es-MX')} títulos al precio de mercado.
          </p>
        )}
        <div className="mt-5 flex gap-2">
          {!confirming ? (
            <button
              className="btn btn-primary"
              disabled={amount == null}
              onClick={() => setConfirming(true)}
              data-testid="buy-start"
            >
              {bond.status === 'bookbuilding' ? 'Revisar orden' : 'Revisar compra'}
            </button>
          ) : (
            <>
              <button
                className="btn btn-gilt"
                disabled={busy}
                onClick={submit}
                data-testid="buy-confirm"
              >
                {busy ? 'Procesando…' : `Confirmar ${formatMoney(amount!)}`}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
      <div className="stub hidden items-center sm:flex" aria-hidden="true">
        <span className="display text-4xl text-gilt" style={{ writingMode: 'vertical-rl' }}>
          Título
        </span>
      </div>
    </section>
  );
}
