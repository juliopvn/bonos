import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';

export interface FlowRow {
  type: 'coupon' | 'principal';
  dueDate: string;
  amountCents: number;
}

/** Calendario de flujos por título: cada fila es un cupón desprendible. */
export function ScheduleTable({ flows, caption }: { flows: FlowRow[]; caption?: string }) {
  const total = flows.reduce((s, f) => s + f.amountCents, 0);
  return (
    <div data-testid="schedule">
      {caption && <p className="label mb-2">{caption}</p>}
      <ol className="space-y-2">
        {flows.map((f, i) => (
          <li key={i} className="coupon" data-testid="schedule-row">
            <div className="flex items-center gap-4 px-4 py-2.5">
              <span className={`badge ${f.type === 'principal' ? 'badge-warn' : 'badge-info'}`}>
                {f.type === 'principal' ? 'Principal' : 'Cupón'}
              </span>
              <span className="num text-sm">{formatDate(f.dueDate)}</span>
            </div>
            <div className="stub flex items-center justify-end py-2.5">
              <span className="num text-sm font-medium">{formatMoney(f.amountCents)}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="hint num mt-3 text-right">Total por título: {formatMoney(total)}</p>
    </div>
  );
}
