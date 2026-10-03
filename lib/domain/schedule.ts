import { mulDiv } from '../money';
import type { CouponType, DayCount, Frequency, PaymentType } from '../types';
import { addMonths, days360, daysBetween, isEndOfMonth } from './dates';

export interface ScheduleInput {
  nominalCents: number;
  annualRateBps: number;
  frequency: Frequency;
  dayCount: DayCount;
  issueDate: Date;
  maturityDate: Date;
}

/** Flujo por título (1 unidad de nominal). */
export interface ScheduleFlow {
  type: PaymentType;
  dueDate: Date;
  periodStart: Date;
  periodEnd: Date;
  amountCents: number;
}

export function effectiveRateBps(bond: {
  couponType: CouponType;
  couponRateBps: number | null;
  referenceRateBps: number | null;
  spreadBps: number | null;
}): number {
  if (bond.couponType === 'fixed') return bond.couponRateBps ?? 0;
  return (bond.referenceRateBps ?? 0) + (bond.spreadBps ?? 0);
}

/** Fechas de cupón generadas hacia atrás desde el vencimiento (regla fin de mes si el vencimiento lo es). */
export function couponDates(issueDate: Date, maturityDate: Date, frequency: Frequency): Date[] {
  if (maturityDate <= issueDate) throw new Error('El vencimiento debe ser posterior a la emisión');
  const step = 12 / frequency;
  const eom = isEndOfMonth(maturityDate);
  const dates: Date[] = [];
  for (let k = 0; ; k++) {
    const d = k === 0 ? maturityDate : addMonths(maturityDate, -step * k, eom);
    if (d <= issueDate) break;
    dates.unshift(d);
  }
  return dates;
}

function accrual(
  start: Date,
  end: Date,
  frequency: Frequency,
  dayCount: DayCount,
  regular: boolean,
): { num: number; den: number } {
  if (dayCount === '30/360') {
    // Periodo regular: exactamente 1/frecuencia del año (evita artefactos de fin de mes).
    return regular ? { num: 1, den: frequency } : { num: days360(start, end), den: 360 };
  }
  return { num: daysBetween(start, end), den: dayCount === 'ACT/360' ? 360 : 365 };
}

/**
 * Calendario de pagos por título: cupones (con primer periodo irregular si procede)
 * y principal al vencimiento.
 */
export function generateSchedule(input: ScheduleInput): ScheduleFlow[] {
  const { nominalCents, annualRateBps, frequency, dayCount, issueDate, maturityDate } = input;
  if (nominalCents <= 0) throw new Error('El nominal debe ser positivo');
  if (annualRateBps < 0) throw new Error('La tasa no puede ser negativa');
  const step = 12 / frequency;
  const eom = isEndOfMonth(maturityDate);
  const dates = couponDates(issueDate, maturityDate, frequency);
  const flows: ScheduleFlow[] = [];

  dates.forEach((due, i) => {
    const start = i === 0 ? issueDate : dates[i - 1];
    const regular = addMonths(due, -step, eom).getTime() === start.getTime();
    const { num, den } = accrual(start, due, frequency, dayCount, regular);
    const amountCents = mulDiv(nominalCents * annualRateBps, num, den * 10_000);
    flows.push({ type: 'coupon', dueDate: due, periodStart: start, periodEnd: due, amountCents });
  });

  flows.push({
    type: 'principal',
    dueDate: maturityDate,
    periodStart: dates.at(-1) ?? issueDate,
    periodEnd: maturityDate,
    amountCents: nominalCents,
  });
  return flows;
}

/** Flujos de un inversor: por título × unidades; solo los posteriores a `after` (compra en secundario). */
export function flowsForUnits(
  flows: readonly ScheduleFlow[],
  units: number,
  after?: Date,
): ScheduleFlow[] {
  return flows
    .filter((f) => !after || f.dueDate > after)
    .map((f) => ({ ...f, amountCents: f.amountCents * units }));
}
