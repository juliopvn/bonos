import { describe, expect, it } from 'vitest';
import { col } from '@/lib/db';
import { changeIssuerRating } from '@/lib/repositories/issuers';
import { closeAndAllocate, placeOrder } from '@/lib/services/bookbuilding';
import { openBookbuilding, updateMarketPrice } from '@/lib/services/bonds';
import { evaluateRebalance, notifyRatingChange, runAlertsJob } from '@/lib/services/alerts';
import { updateAlertPrefs } from '@/lib/repositories/users';
import { d, mailTo, makeBond, makeIssuer, makeUser, setupTestDb } from './helpers';

setupTestDb();

async function hold(adminId: import('mongodb').ObjectId, investor: { _id: import('mongodb').ObjectId }, issuerId: import('mongodb').ObjectId, units: number, over: Record<string, unknown> = {}) {
  const bond = await makeBond(adminId, issuerId, { totalUnits: 100, issueDate: '2020-01-15', maturityDate: '2040-01-15', ...over });
  await openBookbuilding(adminId, bond._id);
  await placeOrder(investor._id, { bondId: bond._id, units, limitPriceBps: 10_000 });
  await closeAndAllocate(adminId, bond._id, 10_000);
  return bond;
}

describe('alertas', () => {
  it('cambio de rating: alerta in-app y email solo a los inversores afectados', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const affected = await makeUser('afectado@test.local');
    const other = await makeUser('otro@test.local');
    const issuer = await makeIssuer('Emisor R', 'AA');
    const otherIssuer = await makeIssuer('Emisor Q', 'A');
    await hold(admin._id, affected, issuer._id, 10);
    await hold(admin._id, other, otherIssuer._id, 10);

    const { previous } = await changeIssuerRating(issuer._id, 'BBB', 'S&P');
    expect(previous).toBe('AA');
    expect(await notifyRatingChange(issuer._id)).toBe(1);

    const alerts = await (await col('alerts')).find({ type: 'rating_change' }).toArray();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].investorId.equals(affected._id)).toBe(true);
    expect(alerts[0].emailedAt).not.toBeNull();
    expect((await mailTo('afectado@test.local')).some((m) => m.subject.startsWith('Alerta: Cambio de rating'))).toBe(true);
    expect((await mailTo('otro@test.local')).some((m) => m.subject.startsWith('Alerta'))).toBe(false);

    // Sin duplicados: reevaluar (evento + job) no crea nada nuevo.
    expect(await notifyRatingChange(issuer._id)).toBe(0);
    expect((await runAlertsJob(new Date())).rating).toBe(0);
  });

  it('variación de precio: respeta el umbral configurable de cada usuario', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const strict = await makeUser('estricto@test.local');
    const relaxed = await makeUser('relajado@test.local');
    await updateAlertPrefs(relaxed._id, { priceMoveBps: 500, concentrationPct: 30, email: false });
    const issuer = await makeIssuer('Emisor P');
    const bond = await hold(admin._id, strict, issuer._id, 10);
    // El libro ya está cerrado: se inserta directamente la posición del segundo inversor.
    await (await col('positions')).insertOne({ _id: new (await import('mongodb')).ObjectId(), investorId: relaxed._id, bondId: bond._id, units: 5, avgCostBps: 10_000, acquiredAt: new Date() });

    await updateMarketPrice(admin._id, bond._id, 10_000, d('2026-03-01'));
    await updateMarketPrice(admin._id, bond._id, 9_700, d('2026-03-02')); // −300 bps

    const alerts = await (await col('alerts')).find({ type: 'price_move' }).toArray();
    expect(alerts.map((a) => a.investorId.toHexString())).toEqual([strict._id.toHexString()]); // 300 < 500 para el relajado
    // El de umbral estricto recibió email; el relajado desactivó el correo y no está en alertas.
    expect((await mailTo('estricto@test.local')).some((m) => m.subject.includes('Alerta'))).toBe(true);
  });

  it('rebalanceo: concentración sobre el umbral, una vez por día', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const inv = await makeUser('conc@test.local');
    const big = await makeIssuer('Emisor Grande', 'AA', 'Energía');
    const small = await makeIssuer('Emisor Chico', 'A', 'Consumo');
    await hold(admin._id, inv, big._id, 90);
    await hold(admin._id, inv, small._id, 10);
    const created = await evaluateRebalance(d('2026-03-05'));
    expect(created).toBeGreaterThanOrEqual(1);
    const alerts = await (await col('alerts')).find({ investorId: inv._id, type: 'rebalance' }).toArray();
    expect(alerts.some((a) => a.payload.key === 'Emisor Grande')).toBe(true);
    expect(await evaluateRebalance(d('2026-03-05'))).toBe(0); // misma fecha: deduplicado
  });
});
