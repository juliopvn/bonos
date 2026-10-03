import type { BondStatus, OrderStatus } from '@/lib/types';

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="rise mb-8 flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-double border-gilt pb-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="display text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card border-dashed p-10 text-center" data-testid="empty">
      <p className="display text-2xl">{title}</p>
      {children && <div className="muted mx-auto mt-2 max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card card-pad">
      <p className="label">{label}</p>
      <p className={`num mt-1 text-2xl font-medium ${tone ?? ''}`}>{value}</p>
      {sub && <p className="hint mt-1">{sub}</p>}
    </div>
  );
}

const BOND_STATUS: Record<BondStatus, [string, string]> = {
  draft: ['Borrador', 'badge-mute'],
  bookbuilding: ['Bookbuilding', 'badge-warn'],
  allocated: ['Adjudicado', 'badge-info'],
  active: ['Vigente', 'badge-ok'],
  matured: ['Vencido', 'badge-mute'],
};
export function BondStatusBadge({ status }: { status: BondStatus }) {
  const [label, cls] = BOND_STATUS[status];
  return (
    <span className={`badge ${cls}`} data-testid="bond-status">
      {label}
    </span>
  );
}

const ORDER_STATUS: Record<OrderStatus, [string, string]> = {
  pending: ['Pendiente', 'badge-warn'],
  allocated: ['Adjudicada', 'badge-ok'],
  partial: ['Parcial', 'badge-info'],
  rejected: ['Rechazada', 'badge-bad'],
  cancelled: ['Cancelada', 'badge-mute'],
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const [label, cls] = ORDER_STATUS[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function RatingBadge({ rating }: { rating: string }) {
  const bad = rating.startsWith('B') && !rating.startsWith('BBB');
  return <span className={`badge ${bad ? 'badge-bad' : rating.startsWith('BBB') ? 'badge-warn' : 'badge-info'}`}>{rating}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
