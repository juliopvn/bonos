import { formatBps } from '@/lib/bps';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';

export interface Point {
  date: string;
  value: number;
}

/** Línea simple en SVG (sin dependencias), con área tenue, extremos y línea base opcional. */
export function LineChart({
  points,
  label,
  format,
  baseline,
  height = 180,
  testId,
}: {
  points: Point[];
  label: string;
  format: (v: number) => string;
  baseline?: number;
  height?: number;
  testId?: string;
}) {
  if (points.length < 2) {
    return (
      <p className="muted text-sm">Aún no hay suficiente historial para dibujar el gráfico.</p>
    );
  }
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 14, b: 24 };
  const values = points.map((p) => p.value).concat(baseline ?? []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - pad.b} L${x(0).toFixed(1)} ${H - pad.b} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <figure data-testid={testId}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: de ${format(first.value)} el ${formatDate(first.date)} a ${format(last.value)} el ${formatDate(last.date)}`}
        className="w-full"
      >
        <path d={area} fill="var(--color-verdigris)" opacity="0.08" />
        {baseline !== undefined && (
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--color-gilt)"
            strokeDasharray="4 4"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="var(--color-verdigris)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="4" fill="var(--color-gilt)" />
        <text x={pad.l} y={H - 6} fontSize="11" fill="var(--color-ink-soft)">
          {formatDate(first.date)}
        </text>
        <text x={W - pad.r} y={H - 6} fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">
          {formatDate(last.date)}
        </text>
      </svg>
      <figcaption className="hint num flex justify-between">
        <span>mín {format(min)}</span>
        <span>máx {format(max)}</span>
      </figcaption>
    </figure>
  );
}

export const moneyChart = (v: number) => formatMoney(v);
export const priceChart = (v: number) => formatBps(v).replace('%', '');

/** Barras horizontales de reparto (rating, sector, plazo…). */
export function DistBars({
  title,
  slices,
}: {
  title: string;
  slices: { key: string; valueCents: number; shareBps: number }[];
}) {
  return (
    <section aria-label={title}>
      <h3 className="label mb-3 uppercase">{title}</h3>
      {slices.length === 0 ? (
        <p className="muted text-sm">Sin posiciones.</p>
      ) : (
        <ul className="space-y-2">
          {slices.map((s) => (
            <li key={s.key} className="text-sm">
              <div className="flex justify-between">
                <span>{s.key}</span>
                <span className="num">{formatBps(s.shareBps, 1)}</span>
              </div>
              <div className="mt-1 h-1.5 bg-line" role="presentation">
                <div
                  className="h-full bg-verdigris"
                  style={{ width: `${Math.max(2, s.shareBps / 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
