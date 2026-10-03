'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { percentToBps } from '@/lib/bps';

type Initial = Record<string, string | undefined>;

const pct = (bps?: string) => (bps ? (Number(bps) / 100).toFixed(2) : '');

export function ScreenerFilters({ sectors, ratings, initial }: { sectors: string[]; ratings: string[]; initial: Initial }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    try {
      for (const k of ['ratingMin', 'ratingMax', 'sector', 'term', 'couponType', 'status', 'maturityFrom', 'maturityTo']) {
        const v = String(fd.get(k) ?? '');
        if (v) q.set(k, v);
      }
      for (const k of ['ytmMin', 'ytmMax']) {
        const v = String(fd.get(k) ?? '').trim();
        if (v) q.set(k, String(percentToBps(v))); // % → bps enteros
      }
      if (initial.sort) q.set('sort', initial.sort);
      setError(null);
      router.push(`/investor/screener?${q}`);
    } catch {
      setError('Rendimiento inválido: usa un porcentaje como 7.5');
    }
  }

  const select = (name: string, label: string, options: [string, string][], testId: string) => (
    <div className="field">
      <label htmlFor={name} className="label">{label}</label>
      <select id={name} name={name} defaultValue={initial[name] ?? ''} className="input" data-testid={testId}>
        <option value="">Todos</option>
        {options.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
      </select>
    </div>
  );

  return (
    <form onSubmit={submit} className="card card-pad rise-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="screener-filters" role="search" aria-label="Filtros del screener">
      {select('ratingMin', 'Rating desde (mejor)', ratings.map((r) => [r, r]), 'f-rating-min')}
      {select('ratingMax', 'Rating hasta (peor)', ratings.map((r) => [r, r]), 'f-rating-max')}
      <div className="field">
        <label htmlFor="ytmMin" className="label">YTM mínimo (%)</label>
        <input id="ytmMin" name="ytmMin" inputMode="decimal" defaultValue={pct(initial.ytmMin)} className="input num" data-testid="f-ytm-min" />
      </div>
      <div className="field">
        <label htmlFor="ytmMax" className="label">YTM máximo (%)</label>
        <input id="ytmMax" name="ytmMax" inputMode="decimal" defaultValue={pct(initial.ytmMax)} className="input num" data-testid="f-ytm-max" />
      </div>
      {select('sector', 'Sector', sectors.map((s) => [s, s]), 'f-sector')}
      {select('term', 'Plazo', [['short', 'Corto (≤ 1 año)'], ['medium', 'Medio (1–5 años)'], ['long', 'Largo (> 5 años)']], 'f-term')}
      <div className="field">
        <label htmlFor="maturityFrom" className="label">Vence desde</label>
        <input id="maturityFrom" name="maturityFrom" type="date" defaultValue={initial.maturityFrom ?? ''} className="input" data-testid="f-maturity-from" />
      </div>
      <div className="field">
        <label htmlFor="maturityTo" className="label">Vence hasta</label>
        <input id="maturityTo" name="maturityTo" type="date" defaultValue={initial.maturityTo ?? ''} className="input" data-testid="f-maturity-to" />
      </div>
      {select('couponType', 'Tipo de cupón', [['fixed', 'Fijo'], ['floating', 'Variable']], 'f-coupon')}
      {select('status', 'Mercado', [['bookbuilding', 'Oferta primaria'], ['active', 'Secundario']], 'f-status')}
      <div className="flex items-end gap-2 lg:col-span-2">
        <button className="btn btn-primary" data-testid="f-apply">Aplicar filtros</button>
        <button type="button" className="btn btn-ghost" onClick={() => router.push('/investor/screener')} data-testid="f-clear">Limpiar</button>
      </div>
      {error && <p role="alert" className="field-error sm:col-span-2 lg:col-span-4">{error}</p>}
    </form>
  );
}
