import type { OrderStatus } from '../types';

export interface BookOrder {
  id: string;
  units: number;
  limitPriceBps: number;
  createdAt: Date;
}

export interface DemandLevel {
  priceBps: number;
  units: number;
  orders: number;
  /** Demanda acumulada a este precio o mejor (precios ≥). */
  cumulativeUnits: number;
}

export interface Demand {
  levels: DemandLevel[];
  totalUnits: number;
  orderCount: number;
  /** Cobertura × 100 (250 = 2,5×). */
  coverageX100: number;
}

/** Demanda agregada por nivel de precio (de mayor a menor precio límite). */
export function aggregateDemand(orders: readonly BookOrder[], offeredUnits: number): Demand {
  const byPrice = new Map<number, { units: number; orders: number }>();
  for (const o of orders) {
    const lvl = byPrice.get(o.limitPriceBps) ?? { units: 0, orders: 0 };
    lvl.units += o.units;
    lvl.orders += 1;
    byPrice.set(o.limitPriceBps, lvl);
  }
  let cumulative = 0;
  const levels = [...byPrice.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([priceBps, l]) => {
      cumulative += l.units;
      return { priceBps, units: l.units, orders: l.orders, cumulativeUnits: cumulative };
    });
  return {
    levels,
    totalUnits: cumulative,
    orderCount: orders.length,
    coverageX100: offeredUnits > 0 ? Math.round((cumulative * 100) / offeredUnits) : 0,
  };
}

export interface Allocation {
  id: string;
  allocatedUnits: number;
  status: Extract<OrderStatus, 'allocated' | 'partial' | 'rejected'>;
}

/**
 * Adjudicación a precio único: entran las órdenes con límite ≥ precio final.
 * Si hay sobresuscripción, prorrateo por títulos con redondeo hacia abajo y el residuo
 * se reparte de a un título por orden de llegada (hasta lo solicitado).
 * Invariante: Σ adjudicado = min(títulos ofertados, demanda elegible).
 */
export function allocate(orders: readonly BookOrder[], finalPriceBps: number, offeredUnits: number): Allocation[] {
  const eligible = orders
    .filter((o) => o.limitPriceBps >= finalPriceBps)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const demand = eligible.reduce((s, o) => s + o.units, 0);
  const granted = new Map<string, number>();

  if (demand <= offeredUnits) {
    for (const o of eligible) granted.set(o.id, o.units);
  } else {
    let assigned = 0;
    for (const o of eligible) {
      const share = Math.floor((o.units * offeredUnits) / demand);
      granted.set(o.id, share);
      assigned += share;
    }
    let residual = offeredUnits - assigned;
    while (residual > 0) {
      let progressed = false;
      for (const o of eligible) {
        if (residual === 0) break;
        if ((granted.get(o.id) ?? 0) < o.units) {
          granted.set(o.id, (granted.get(o.id) ?? 0) + 1);
          residual -= 1;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
  }

  return orders.map((o) => {
    const allocatedUnits = granted.get(o.id) ?? 0;
    const status = allocatedUnits === 0 ? 'rejected' : allocatedUnits === o.units ? 'allocated' : 'partial';
    return { id: o.id, allocatedUnits, status };
  });
}
