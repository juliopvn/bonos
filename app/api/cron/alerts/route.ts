import { authorizeCron } from '@/lib/cron';
import { ok, route } from '@/lib/http';
import { runAlertsJob } from '@/lib/services/alerts';

export const dynamic = 'force-dynamic';

// Vercel Cron invoca con GET; el endpoint manual y los scripts usan POST.
const handler = route(async (req) => ok(await runAlertsJob(authorizeCron(req))));
export const GET = handler;
export const POST = handler;
