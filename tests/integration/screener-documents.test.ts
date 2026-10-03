import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { col } from '@/lib/db';
import { closeAndAllocate, placeOrder } from '@/lib/services/bookbuilding';
import { openBookbuilding, updateMarketPrice } from '@/lib/services/bonds';
import { authorizedDownloadUrl, uploadDocument } from '@/lib/services/documents';
import { generateBondReport } from '@/lib/services/reports';
import { screenBonds } from '@/lib/services/screener';
import { screenerSchema } from '@/lib/validation';
import { d, makeBond, makeIssuer, makeUser, setupTestDb } from './helpers';

setupTestDb();
const q = (o: Record<string, unknown> = {}) => screenerSchema.parse(o);

describe('screener', () => {
  it('filtra por rating, YTM, plazo, vencimiento, sector y tipo; ordena y pagina en servidor', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const aaa = await makeIssuer('Sector AAA', 'AAA', 'Energía');
    const bb = await makeIssuer('Sector BB', 'BB', 'Minería');
    const mk = (issuer: typeof aaa, code: string, over: Record<string, unknown>) =>
      makeBond(admin._id, issuer._id, { code, issueDate: '2031-01-15', ...over }).then(async (b) => {
        await openBookbuilding(admin._id, b._id); // visibles en el screener (oferta primaria)
        return b;
      });
    await mk(aaa, 'SC-AAA-CORTO', { maturityDate: '2031-12-15', couponRateBps: 400 });
    await mk(aaa, 'SC-AAA-MEDIO', { maturityDate: '2034-01-15', couponRateBps: 500 });
    await mk(bb, 'SC-BB-LARGO', { maturityDate: '2040-01-15', couponRateBps: 1200 });
    await mk(bb, 'SC-BB-VAR', { maturityDate: '2034-01-15', couponType: 'floating', couponRateBps: undefined, referenceRateBps: 1000, spreadBps: 300 });
    const codes = async (o: Record<string, unknown>) => (await screenBonds(q({ pageSize: 50, ...o }))).items.map((b) => b.code).sort();

    expect(await codes({})).toHaveLength(4);
    expect(await codes({ ratingMin: 'AAA', ratingMax: 'AA' })).toEqual(['SC-AAA-CORTO', 'SC-AAA-MEDIO']);
    expect(await codes({ ratingMin: 'BBB-', ratingMax: 'D' })).toEqual(['SC-BB-LARGO', 'SC-BB-VAR']);
    expect(await codes({ ytmMin: 1000 })).toEqual(['SC-BB-LARGO', 'SC-BB-VAR']);
    expect(await codes({ ytmMax: 500 })).toEqual(['SC-AAA-CORTO', 'SC-AAA-MEDIO']);
    expect(await codes({ term: 'short' })).toEqual(['SC-AAA-CORTO']);
    expect(await codes({ term: 'long' })).toEqual(['SC-BB-LARGO']);
    expect(await codes({ sector: 'Minería' })).toEqual(['SC-BB-LARGO', 'SC-BB-VAR']);
    expect(await codes({ couponType: 'floating' })).toEqual(['SC-BB-VAR']);
    expect(await codes({ maturityFrom: '2033-01-01', maturityTo: '2035-01-01' })).toEqual(['SC-AAA-MEDIO', 'SC-BB-VAR']);
    expect(await codes({ sector: 'Energía', ytmMin: 1000 })).toEqual([]); // filtros combinables

    const sorted = await screenBonds(q({ sort: '-ytm', pageSize: 2 }));
    expect(sorted.items.map((b) => b.code)).toEqual(['SC-BB-VAR', 'SC-BB-LARGO']); // 13% > 12%
    expect(sorted).toMatchObject({ total: 4, pages: 2, page: 1 });
    const page2 = await screenBonds(q({ sort: '-ytm', pageSize: 2, page: 2 }));
    expect(page2.items.map((b) => b.code)).toEqual(['SC-AAA-MEDIO', 'SC-AAA-CORTO']);
    expect((await screenBonds(q({ sort: 'rating', pageSize: 1 }))).items[0].issuer.rating).toBe('AAA');
  });
});

describe('documentos', () => {
  const pdf = (name = 'doc.pdf') => new File([Buffer.from('%PDF-1.4 test')], name, { type: 'application/pdf' });

  it('sube, genera reporte y autoriza la descarga solo a admin y a inversores con posición', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const holder = await makeUser('holder@test.local');
    const outsider = await makeUser('outsider@test.local');
    const issuer = await makeIssuer('Emisor Docs');
    const bond = await makeBond(admin._id, issuer._id, { issueDate: '2020-01-15', maturityDate: '2040-01-15', totalUnits: 10 });
    await openBookbuilding(admin._id, bond._id);
    await placeOrder(holder._id, { bondId: bond._id, units: 5, limitPriceBps: 10_000 });
    await closeAndAllocate(admin._id, bond._id, 10_000);
    await updateMarketPrice(admin._id, bond._id, 10_000, d('2026-03-01'));

    const doc = await uploadDocument(admin._id, { bondId: bond._id, kind: 'fiscal', file: pdf() });
    expect(doc.storageKey).toContain(`bonds/${bond._id.toHexString()}/fiscal/`);

    const as = (u: { _id: ObjectId }, role: 'admin' | 'investor') => ({ id: u._id.toHexString(), role });
    expect(await authorizedDownloadUrl(as(admin, 'admin'), doc._id)).toMatch(/\/api\/storage\/download\?key=/);
    expect(await authorizedDownloadUrl(as(holder, 'investor'), doc._id)).toMatch(/sig=/);
    await expect(authorizedDownloadUrl(as(outsider, 'investor'), doc._id)).rejects.toMatchObject({ status: 403 });

    const report = await generateBondReport(admin._id, bond._id);
    expect(report.kind).toBe('report');
    expect(await (await col('documents')).countDocuments({ bondId: bond._id })).toBe(2);
  });

  it('valida tipo y tamaño', async () => {
    const admin = await makeUser('admin@test.local', 'admin');
    const issuer = await makeIssuer('Emisor Docs 2');
    const bond = await makeBond(admin._id, issuer._id);
    const exe = new File([Buffer.from('MZ')], 'virus.exe', { type: 'application/x-msdownload' });
    await expect(uploadDocument(admin._id, { bondId: bond._id, kind: 'fiscal', file: exe })).rejects.toMatchObject({ status: 400 });
    const fake = new File([Buffer.from('x')], 'falso.pdf', { type: 'image/png' }); // extensión ≠ tipo
    await expect(uploadDocument(admin._id, { bondId: bond._id, kind: 'fiscal', file: fake })).rejects.toMatchObject({ status: 400 });
    const big = new File([Buffer.alloc(5 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' });
    await expect(uploadDocument(admin._id, { bondId: bond._id, kind: 'fiscal', file: big })).rejects.toThrow(/5 MB/);
    const empty = new File([], 'vacio.pdf', { type: 'application/pdf' });
    await expect(uploadDocument(admin._id, { bondId: bond._id, kind: 'fiscal', file: empty })).rejects.toThrow(/vacío/);
  });
});
