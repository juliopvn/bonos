import { closeDb } from '@/lib/db';
import { parseISODate, startOfUtcDay } from '@/lib/domain/dates';
import { runPaymentsJob } from '@/lib/jobs/payments';
import { runAlertsJob } from '@/lib/services/alerts';

/** pnpm jobs:run [--date=YYYY-MM-DD] [--only=payments|alerts] */
async function main() {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const asOf = arg('date') ? parseISODate(arg('date')!) : startOfUtcDay(new Date());
  const only = arg('only');
  console.log(`[jobs] fecha de proceso: ${asOf.toISOString().slice(0, 10)}`);
  if (!only || only === 'payments') console.log('[jobs] pagos:', await runPaymentsJob(asOf));
  if (!only || only === 'alerts') console.log('[jobs] alertas:', await runAlertsJob(asOf));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
