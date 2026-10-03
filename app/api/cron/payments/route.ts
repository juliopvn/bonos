import { authorizeCron } from '@/lib/cron';
import { ok, route } from '@/lib/http';
import { runPaymentsJob } from '@/lib/jobs/payments';

export const dynamic = 'force-dynamic';

// Vercel Cron invoca con GET; el endpoint manual y los scripts usan POST.
const handler = route(async (req) => ok(await runPaymentsJob(authorizeCron(req))));
export const GET = handler;
export const POST = handler;
