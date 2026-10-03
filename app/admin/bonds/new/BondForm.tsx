'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ScheduleTable, type FlowRow } from '@/components/ScheduleTable';
import { useGlobal } from '@/context/GlobalContext';
import { percentToBps } from '@/lib/bps';
import { api } from '@/lib/client-api';
import { FREQUENCY_LABEL, TERM_LABEL } from '@/lib/domain/term';
import { formatMoney, parseMoneyToCents } from '@/lib/money';
import type { Frequency, Term } from '@/lib/types';

interface Preview {
  term: Term;
  flows: FlowRow[];
  totalCents: number;
}

export function BondForm({ issuers }: { issuers: { id: string; name: string; rating: string }[] }) {
  const router = useRouter();
  const { toast } = useGlobal();
  const [f, setF] = useState({
    issuerId: issuers[0].id,
    name: '',
    code: '',
    nominal: '1000.00',
    couponType: 'fixed' as 'fixed' | 'floating',
    couponRate: '7.00',
    referenceRate: '11.00',
    spread: '1.50',
    frequency: '2',
    dayCount: '30/360',
    issueDate: '',
    maturityDate: '',
    totalUnits: '1000',
  });
  const [result, setResult] = useState<{ key: string; preview?: Preview; error?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  // Convierte el formulario a enteros (céntimos y bps) sin pasar por coma flotante.
  const payload = useMemo(() => {
    try {
      return {
        nominalCents: parseMoneyToCents(f.nominal),
        couponType: f.couponType,
        ...(f.couponType === 'fixed'
          ? { couponRateBps: percentToBps(f.couponRate) }
          : { referenceRateBps: percentToBps(f.referenceRate), spreadBps: percentToBps(f.spread) }),
        frequency: Number(f.frequency) as Frequency,
        dayCount: f.dayCount,
        issueDate: f.issueDate,
        maturityDate: f.maturityDate,
      };
    } catch (e) {
      return e instanceof Error ? e : new Error('Datos inválidos');
    }
  }, [f]);

  const localError = payload instanceof Error ? payload.message : null;
  const ready = !localError && !!f.issueDate && !!f.maturityDate;
  const key = JSON.stringify(payload);

  // Previsualización con antirrebote; el estado solo se escribe desde el callback asíncrono.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const preview = await api<Preview>('/api/admin/bonds/preview', { body: payload });
        if (!cancelled) setResult({ key, preview });
      } catch (e) {
        if (!cancelled)
          setResult({
            key,
            error: e instanceof Error ? e.message : 'No se pudo calcular el calendario',
          });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ready, payload, key]);

  const current = ready && result?.key === key ? result : null;
  const preview = current?.preview ?? null;
  const previewError = localError ?? current?.error ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (payload instanceof Error) return toast(payload.message, 'error');
    setBusy(true);
    try {
      const bond = await api<{ _id: string }>('/api/admin/bonds', {
        body: {
          ...payload,
          issuerId: f.issuerId,
          name: f.name,
          code: f.code,
          totalUnits: Number(f.totalUnits),
        },
      });
      toast('Emisión creada en borrador');
      router.push(`/admin/bonds/${bond._id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear la emisión', 'error');
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form
        onSubmit={submit}
        className="card card-pad rise-2 grid gap-5 sm:grid-cols-2"
        data-testid="bond-form"
      >
        <div className="field sm:col-span-2">
          <label htmlFor="issuerId" className="label">
            Emisor
          </label>
          <select
            id="issuerId"
            className="input"
            value={f.issuerId}
            onChange={set('issuerId')}
            data-testid="bond-issuer"
          >
            {issuers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.rating}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="name" className="label">
            Nombre de la emisión
          </label>
          <input
            id="name"
            required
            minLength={3}
            className="input"
            value={f.name}
            onChange={set('name')}
            data-testid="bond-name"
          />
        </div>
        <div className="field">
          <label htmlFor="code" className="label">
            Código
          </label>
          <input
            id="code"
            required
            className="input num uppercase"
            value={f.code}
            onChange={set('code')}
            placeholder="AUR-2031A"
            data-testid="bond-code"
          />
          <span className="hint">4–24 caracteres: letras, números o guion.</span>
        </div>
        <div className="field">
          <label htmlFor="nominal" className="label">
            Valor nominal (MXN por título)
          </label>
          <input
            id="nominal"
            inputMode="decimal"
            className="input num"
            value={f.nominal}
            onChange={set('nominal')}
            data-testid="bond-nominal"
          />
        </div>
        <div className="field">
          <label htmlFor="totalUnits" className="label">
            Títulos a emitir
          </label>
          <input
            id="totalUnits"
            type="number"
            min={1}
            step={1}
            className="input num"
            value={f.totalUnits}
            onChange={set('totalUnits')}
            data-testid="bond-units"
          />
        </div>

        <fieldset className="field sm:col-span-2">
          <legend className="label mb-1">Tipo de cupón</legend>
          <div className="flex gap-6">
            {(['fixed', 'floating'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="couponType"
                  checked={f.couponType === t}
                  onChange={() => setF((s) => ({ ...s, couponType: t }))}
                  data-testid={`coupon-${t}`}
                />
                {t === 'fixed' ? 'Tasa fija' : 'Tasa variable'}
              </label>
            ))}
          </div>
        </fieldset>
        {f.couponType === 'fixed' ? (
          <div className="field">
            <label htmlFor="couponRate" className="label">
              Tasa de cupón anual (%)
            </label>
            <input
              id="couponRate"
              inputMode="decimal"
              className="input num"
              value={f.couponRate}
              onChange={set('couponRate')}
              data-testid="bond-rate"
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="referenceRate" className="label">
                Tasa de referencia (%)
              </label>
              <input
                id="referenceRate"
                inputMode="decimal"
                className="input num"
                value={f.referenceRate}
                onChange={set('referenceRate')}
                data-testid="bond-reference"
              />
            </div>
            <div className="field">
              <label htmlFor="spread" className="label">
                Spread (%)
              </label>
              <input
                id="spread"
                inputMode="decimal"
                className="input num"
                value={f.spread}
                onChange={set('spread')}
                data-testid="bond-spread"
              />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="frequency" className="label">
            Frecuencia de pago
          </label>
          <select
            id="frequency"
            className="input"
            value={f.frequency}
            onChange={set('frequency')}
            data-testid="bond-frequency"
          >
            {([12, 4, 2, 1] as Frequency[]).map((q) => (
              <option key={q} value={q}>
                {FREQUENCY_LABEL[q]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dayCount" className="label">
            Convención de días
          </label>
          <select id="dayCount" className="input" value={f.dayCount} onChange={set('dayCount')}>
            <option>30/360</option>
            <option>ACT/360</option>
            <option>ACT/365</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="issueDate" className="label">
            Fecha de emisión
          </label>
          <input
            id="issueDate"
            type="date"
            required
            className="input"
            value={f.issueDate}
            onChange={set('issueDate')}
            data-testid="bond-issue"
          />
        </div>
        <div className="field">
          <label htmlFor="maturityDate" className="label">
            Vencimiento
          </label>
          <input
            id="maturityDate"
            type="date"
            required
            className="input"
            value={f.maturityDate}
            onChange={set('maturityDate')}
            data-testid="bond-maturity"
          />
        </div>
        <div className="sm:col-span-2">
          <button className="btn btn-primary" disabled={busy || !preview} data-testid="bond-submit">
            {busy ? 'Guardando…' : 'Guardar como borrador'}
          </button>
        </div>
      </form>

      <aside className="rise-3 xl:sticky xl:top-6 xl:self-start" aria-live="polite">
        <div className="certificate p-6">
          <p className="eyebrow">Previsualización</p>
          <h2 className="display mt-1 text-2xl">Calendario por título</h2>
          {preview && (
            <p className="mt-2 text-sm" data-testid="derived-term">
              Plazo: <strong>{TERM_LABEL[preview.term]}</strong> · Nominal{' '}
              {formatMoney(payload instanceof Error ? 0 : payload.nominalCents)}
            </p>
          )}
          <div className="mt-4 max-h-[460px] overflow-y-auto pr-1">
            {preview ? (
              <ScheduleTable flows={preview.flows} />
            ) : (
              <p className="muted text-sm" data-testid="preview-empty">
                {previewError ??
                  'Indica las fechas de emisión y vencimiento para ver cada cupón y el principal.'}
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
