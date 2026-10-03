import { expect, type APIRequestContext } from '@playwright/test';

/** Ejecuta un job de cron simulando una fecha (solo permitido con E2E_MODE=true). */
export async function runCron(
  request: APIRequestContext,
  job: 'payments' | 'alerts',
  date: string,
) {
  const res = await request.post(`/api/cron/${job}?date=${date}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}
