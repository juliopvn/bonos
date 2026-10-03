import type { Frequency, Term } from '../types';
import { addMonths } from './dates';

export const FREQUENCIES: readonly Frequency[] = [12, 4, 2, 1];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  12: 'Mensual',
  4: 'Trimestral',
  2: 'Semestral',
  1: 'Anual',
};

export const TERM_LABEL: Record<Term, string> = { short: 'Corto', medium: 'Medio', long: 'Largo' };

/** Plazo original (emisión → vencimiento): corto ≤ 1 año, medio ≤ 5 años, largo > 5 años. */
export function deriveTerm(issueDate: Date, maturityDate: Date): Term {
  if (maturityDate <= issueDate) throw new Error('El vencimiento debe ser posterior a la emisión');
  if (maturityDate <= addMonths(issueDate, 12)) return 'short';
  if (maturityDate <= addMonths(issueDate, 60)) return 'medium';
  return 'long';
}
