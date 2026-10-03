import { requireRole } from '@/lib/auth/guards';
import { deriveTerm } from '@/lib/domain/term';
import { ok, readJson, route } from '@/lib/http';
import { previewSchedule } from '@/lib/services/bonds';
import { previewSchema } from '@/lib/validation';

export const POST = route(async (req) => {
  await requireRole('admin');
  const input = previewSchema.parse(await readJson(req));
  const flows = previewSchedule(input);
  return ok({
    term: deriveTerm(input.issueDate, input.maturityDate),
    flows: flows.map((f) => ({ type: f.type, dueDate: f.dueDate.toISOString().slice(0, 10), amountCents: f.amountCents })),
    totalCents: flows.reduce((s, f) => s + f.amountCents, 0),
  });
});
