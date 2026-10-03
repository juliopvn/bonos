'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useGlobal } from '@/context/GlobalContext';
import { formatPrice, percentToBps } from '@/lib/bps';
import { api } from '@/lib/client-api';
import { allocate } from '@/lib/domain/bookbuilding';
import { formatCoverage, formatDateTime } from '@/lib/format';
import type { Plain } from '@/lib/plain';
import type { getBook } from '@/lib/services/bookbuilding';

type Book = Plain<Awaited<ReturnType<typeof getBook>>>;

export function LiveBook({ bondId, initial }: { bondId: string; initial: Book }) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [book, setBook] = useState(initial);
  // Precio sugerido: el nivel más alto donde la demanda acumulada cubre lo ofertado (o el más bajo del libro).
  const [price, setPrice] = useState(() => {
    const levels = initial.demand.levels;
    const clearing =
      levels.find((l) => l.cumulativeUnits >= initial.bond.totalUnits) ?? levels.at(-1);
    return formatPrice(clearing?.priceBps ?? 10_000);
  });
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const open = book.bond.status === 'bookbuilding';

  // Actualización en vivo por polling cada 3 s mientras el libro esté abierto.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(async () => {
      try {
        setBook(await api<Book>(`/api/admin/bonds/${bondId}/book`));
        setUpdatedAt(new Date());
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [bondId, open]);

  const finalBps = useMemo(() => {
    try {
      return percentToBps(price);
    } catch {
      return null;
    }
  }, [price]);

  // Simulación de la adjudicación con el precio tecleado (misma función que usa el servidor).
  const projection = useMemo(() => {
    if (finalBps == null) return null;
    const result = allocate(
      book.orders.map((o) => ({
        id: o.id,
        units: o.units,
        limitPriceBps: o.limitPriceBps,
        createdAt: new Date(o.createdAt),
      })),
      finalBps,
      book.bond.totalUnits,
    );
    return {
      allocated: result.reduce((s, r) => s + r.allocatedUnits, 0),
      rejected: result.filter((r) => r.status === 'rejected').length,
    };
  }, [book, finalBps]);

  const maxLevel = Math.max(
    1,
    ...book.demand.levels.map((l) => l.cumulativeUnits),
    book.bond.totalUnits,
  );

  async function allocateNow() {
    if (finalBps == null) return toast('Indica un precio final válido, p. ej. 100.00', 'error');
    if (
      !window.confirm(
        `¿Cerrar el libro y adjudicar a ${formatPrice(finalBps)}% del nominal? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await api<{ allocatedUnits: number }>(`/api/admin/bonds/${bondId}/allocate`, {
        body: { finalPriceBps: finalBps },
      });
      toast(`Adjudicados ${res.allocatedUnits.toLocaleString('es-MX')} títulos`);
      setBook(await api<Book>(`/api/admin/bonds/${bondId}/book`));
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo adjudicar', 'error');
    } finally {
      setBusy(false);
    }
  }

  const stat = (label: string, value: string, testId: string) => (
    <div className="card card-pad">
      <p className="label">{label}</p>
      <p className="num mt-1 text-2xl font-medium" data-testid={testId}>
        {value}
      </p>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stat('Títulos ofertados', book.bond.totalUnits.toLocaleString('es-MX'), 'book-offered')}
        {stat('Demanda total', book.demand.totalUnits.toLocaleString('es-MX'), 'book-demand')}
        {stat('Cobertura', formatCoverage(book.demand.coverageX100), 'book-coverage')}
        {stat('Órdenes', String(book.demand.orderCount), 'book-orders')}
      </div>

      {!open ? (
        <div className="card card-pad" role="status" data-testid="book-closed">
          <p className="display text-2xl">Libro cerrado</p>
          <p className="muted mt-1 text-sm">
            Esta emisión ya fue adjudicada
            {book.bond.finalPriceBps
              ? ` a ${formatPrice(book.bond.finalPriceBps)}% del nominal`
              : ''}
            .
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="demand" className="card card-pad">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="demand" className="display text-2xl">
                Demanda por nivel de precio
              </h2>
              <span className="hint flex items-center gap-2">
                <span className="live-dot" aria-hidden="true" /> En vivo ·{' '}
                {updatedAt.toLocaleTimeString('es-MX')}
              </span>
            </div>
            {book.demand.levels.length === 0 ? (
              <p className="muted text-sm" data-testid="book-empty">
                Sin órdenes todavía. Cuando los inversores coloquen órdenes, aparecerán aquí.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table" data-testid="demand-table">
                  <thead>
                    <tr>
                      <th>Precio límite</th>
                      <th className="r">Títulos</th>
                      <th className="r">Órdenes</th>
                      <th className="w-1/2">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.demand.levels.map((l) => (
                      <tr key={l.priceBps} data-testid="demand-level">
                        <td className="num">{formatPrice(l.priceBps)}</td>
                        <td className="num r">{l.units.toLocaleString('es-MX')}</td>
                        <td className="num r">{l.orders}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-3 grow bg-line" role="presentation">
                              <div
                                className="h-full bg-verdigris"
                                style={{ width: `${(l.cumulativeUnits / maxLevel) * 100}%` }}
                              />
                            </div>
                            <span className="num text-xs">
                              {l.cumulativeUnits.toLocaleString('es-MX')}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="close" className="certificate p-6">
            <h2 id="close" className="display text-2xl">
              Cerrar libro y adjudicar
            </h2>
            <p className="muted mt-1 text-sm">
              Se adjudican las órdenes con precio límite ≥ precio final. Si hay sobresuscripción se
              prorratea por títulos.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="field">
                <label htmlFor="final" className="label">
                  Precio final (% del nominal)
                </label>
                <input
                  id="final"
                  className="input num !w-36"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  data-testid="final-price"
                  inputMode="decimal"
                />
              </div>
              <button
                className="btn btn-primary"
                disabled={busy || book.demand.orderCount === 0}
                onClick={allocateNow}
                data-testid="allocate"
              >
                {busy ? 'Adjudicando…' : 'Cerrar libro y adjudicar'}
              </button>
              {projection && (
                <p className="hint num" data-testid="projection">
                  Proyección: {projection.allocated.toLocaleString('es-MX')} de{' '}
                  {book.bond.totalUnits.toLocaleString('es-MX')} títulos · {projection.rejected}{' '}
                  órdenes quedan fuera
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="orders">
            <h2 id="orders" className="display mb-3 text-2xl">
              Órdenes pendientes
            </h2>
            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Inversor</th>
                    <th className="r">Títulos</th>
                    <th className="r">Precio límite</th>
                    <th>Recibida</th>
                  </tr>
                </thead>
                <tbody>
                  {book.orders.map((o) => (
                    <tr key={o.id} data-testid="book-order">
                      <td>{o.investor}</td>
                      <td className="num r">{o.units.toLocaleString('es-MX')}</td>
                      <td className="num r">{formatPrice(o.limitPriceBps)}</td>
                      <td className="num">{formatDateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                  {book.orders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sin órdenes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
