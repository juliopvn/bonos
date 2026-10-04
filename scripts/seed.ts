/**
 * Seed determinista (faker con semilla fija) e idempotente.
 *   pnpm seed                  → inserta lo que falte (por claves naturales)
 *   pnpm seed:reset            → borra TODA la base y regenera (nunca con perfil demo)
 * Perfiles (SEED_PROFILE): dev (completo) | e2e (mínimo y estable) | demo (completo, sin borrar; ALLOW_SEED=true)
 */
import { faker } from '@faker-js/faker';
import { ObjectId } from 'mongodb';
import { closeDb, col, getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { addDays, addMonths, startOfUtcDay, toISODate } from '@/lib/domain/dates';
import { deriveTerm } from '@/lib/domain/term';
import { effectiveRateBps, flowsForUnits, generateSchedule } from '@/lib/domain/schedule';
import { ytmFromPrice } from '@/lib/domain/ytm';
import { RATING_SCALE } from '@/lib/domain/rating';
import { putObject } from '@/lib/storage';
import { defaultAlertPrefs } from '@/lib/repositories/users';
import type {
  AlertDoc,
  BondDoc,
  CouponType,
  DocumentDoc,
  DocumentKind,
  Frequency,
  IssuerDoc,
  OrderDoc,
  PositionDoc,
  ScheduledPaymentDoc,
  UserDoc,
} from '@/lib/types';
import { miniPdf } from './seed-pdf';

const today = startOfUtcDay(new Date());
const log = (m: string) => console.log(`[seed] ${m}`);

// ── Catálogos ────────────────────────────────────────────────────────────────
const ISSUERS = [
  ['Aurora Energía', 'Energía', 'AA'],
  ['Banco Meridiano', 'Financiero', 'A+'],
  ['Consumo Altiplano', 'Consumo', 'A-'],
  ['Telecom Boreal', 'Telecomunicaciones', 'BBB+'],
  ['Infraestructura del Norte', 'Infraestructura', 'AAA'],
  ['Minera Sierra Alta', 'Minería', 'BBB'],
  ['Logística Cruz del Sur', 'Logística', 'BB+'],
  ['Salud Integral', 'Salud', 'AA-'],
  ['Inmobiliaria Costa Dorada', 'Inmobiliario', 'BB'],
  ['Agroindustrias del Valle', 'Agroindustria', 'A'],
] as const;

const BOND_NAMES = [
  'Serie',
  'Bono Verde',
  'Certificado Bursátil',
  'Nota Senior',
  'Bono Subordinado',
  'Bono Social',
];

async function upsertUser(
  email: string,
  name: string,
  role: 'admin' | 'investor',
): Promise<UserDoc> {
  const users = await col('users');
  const found = await users.findOne({ email });
  if (found) return found;
  const doc: UserDoc = {
    _id: new ObjectId(),
    email,
    name,
    role,
    createdAt: addDays(today, -200),
    alertPrefs: defaultAlertPrefs(),
  };
  await users.insertOne(doc);
  return doc;
}

async function upsertIssuer(
  name: string,
  sector: string,
  rating: string,
  withHistory: boolean,
): Promise<IssuerDoc> {
  const issuers = await col('issuers');
  const found = await issuers.findOne({ name });
  if (found) return found;
  const idx = RATING_SCALE.indexOf(rating as never);
  const history = withHistory
    ? [
        { rating: RATING_SCALE[Math.max(0, idx - 1)], date: addDays(today, -420), agency: 'S&P' },
        {
          rating: RATING_SCALE[Math.min(idx + 1, RATING_SCALE.length - 1)],
          date: addDays(today, -230),
          agency: 'Fitch',
        },
        { rating, date: addDays(today, -95), agency: 'S&P' },
      ]
    : [{ rating, date: addDays(today, -365), agency: 'S&P' }];
  const doc: IssuerDoc = {
    _id: new ObjectId(),
    name,
    sector,
    country: 'México',
    rating,
    ratingHistory: history,
    createdAt: addDays(today, -500),
  };
  await issuers.insertOne(doc);
  return doc;
}

interface BondSpec {
  code: string;
  name: string;
  issuer: IssuerDoc;
  couponType: CouponType;
  couponRateBps?: number;
  referenceRateBps?: number;
  spreadBps?: number;
  frequency: Frequency;
  nominalCents: number;
  issueDate: Date;
  maturityDate: Date;
  totalUnits: number;
  status: BondDoc['status'];
  priceBps?: number;
  availableUnits?: number;
}

async function insertBond(s: BondSpec): Promise<BondDoc | null> {
  const bonds = await col('bonds');
  if (await bonds.findOne({ code: s.code })) return null;
  const doc: BondDoc = {
    _id: new ObjectId(),
    issuerId: s.issuer._id,
    name: s.name,
    code: s.code,
    nominalCents: s.nominalCents,
    couponType: s.couponType,
    couponRateBps: s.couponType === 'fixed' ? (s.couponRateBps ?? null) : null,
    referenceRateBps: s.couponType === 'floating' ? (s.referenceRateBps ?? null) : null,
    spreadBps: s.couponType === 'floating' ? (s.spreadBps ?? null) : null,
    frequency: s.frequency,
    dayCount: '30/360',
    issueDate: s.issueDate,
    maturityDate: s.maturityDate,
    term: deriveTerm(s.issueDate, s.maturityDate),
    status: s.status,
    totalUnits: s.totalUnits,
    availableUnits: s.status === 'active' ? (s.availableUnits ?? 0) : 0,
    finalPriceBps: s.status === 'active' || s.status === 'matured' ? 10_000 : null,
    marketPriceBps:
      s.status === 'draft' || s.status === 'bookbuilding' ? 10_000 : (s.priceBps ?? 10_000),
    ytmBps: null,
    createdAt: addDays(s.issueDate, -40),
  };
  const flows = flowsOf(doc);
  doc.ytmBps =
    s.status === 'matured'
      ? null
      : (ytmFromPrice(
          flows,
          doc.nominalCents,
          doc.marketPriceBps!,
          today > doc.issueDate ? today : doc.issueDate,
          doc.frequency,
        ) ?? effectiveRateBps(doc));
  await bonds.insertOne(doc);
  return doc;
}

const flowsOf = (b: BondDoc) =>
  generateSchedule({
    nominalCents: b.nominalCents,
    annualRateBps: effectiveRateBps(b),
    frequency: b.frequency,
    dayCount: b.dayCount,
    issueDate: b.issueDate,
    maturityDate: b.maturityDate,
  });

/** Serie mensual de precios (paseo aleatorio acotado) y último movimiento diario. */
async function seedPriceHistory(bond: BondDoc, finalPrice: number, jump = 0) {
  const history = await col('priceHistory');
  const start = bond.issueDate > addMonths(today, -12) ? bond.issueDate : addMonths(today, -12);
  const dates: Date[] = [];
  for (let d = start; d <= addDays(today, -1); d = addMonths(d, 1)) dates.push(d);
  dates.push(addDays(today, -1), today);
  const uniq = [...new Map(dates.map((d) => [toISODate(d), d])).values()];
  const n = uniq.length;
  let price = finalPrice - faker.number.int({ min: -250, max: 250 });
  const docs = uniq.map((date, i) => {
    const last = i === n - 1;
    price = last
      ? finalPrice
      : i === n - 2
        ? finalPrice - jump
        : Math.min(10_800, Math.max(8_800, price + faker.number.int({ min: -90, max: 90 })));
    const ytm = ytmFromPrice(flowsOf(bond), bond.nominalCents, price, date, bond.frequency) ?? 0;
    return { _id: new ObjectId(), bondId: bond._id, date, priceBps: price, ytmBps: ytm };
  });
  await history.insertMany(docs);
  return docs;
}

function paymentsFor(
  bond: BondDoc,
  investorId: ObjectId,
  units: number,
  acquiredAt: Date,
): ScheduledPaymentDoc[] {
  return flowsForUnits(flowsOf(bond), units, acquiredAt).map((f) => ({
    _id: new ObjectId(),
    bondId: bond._id,
    investorId,
    type: f.type,
    dueDate: f.dueDate,
    amountCents: f.amountCents,
    status: f.dueDate <= today ? 'paid' : 'scheduled',
    paidAt: f.dueDate <= today ? f.dueDate : null,
  }));
}

async function hold(
  bond: BondDoc,
  investorId: ObjectId,
  units: number,
  avgCostBps: number,
  acquiredAt: Date,
  closed = false,
) {
  const pos: PositionDoc = {
    _id: new ObjectId(),
    investorId,
    bondId: bond._id,
    units: closed ? 0 : units,
    avgCostBps,
    acquiredAt,
  };
  await (await col('positions')).insertOne(pos);
  const pays = paymentsFor(bond, investorId, units, acquiredAt);
  if (pays.length) await (await col('scheduledPayments')).insertMany(pays);
  // Orden histórica adjudicada (origen de la posición).
  await (
    await col('orders')
  ).insertOne({
    _id: new ObjectId(),
    bondId: bond._id,
    investorId,
    units,
    limitPriceBps: avgCostBps + 20,
    status: 'allocated',
    allocatedUnits: units,
    createdAt: addDays(acquiredAt, -2),
  } as OrderDoc);
}

async function addDocument(
  bond: BondDoc,
  adminId: ObjectId,
  kind: DocumentKind,
  fileName: string,
  lines: string[],
) {
  const documents = await col('documents');
  if (await documents.findOne({ bondId: bond._id, fileName })) return;
  const body = fileName.endsWith('.csv') ? Buffer.from(lines.join('\n') + '\n') : miniPdf(lines);
  const contentType = fileName.endsWith('.csv') ? 'text/csv' : 'application/pdf';
  const storageKey = `bonds/${bond._id.toHexString()}/${kind}/seed-${fileName}`;
  await putObject(storageKey, body, contentType);
  const doc: DocumentDoc = {
    _id: new ObjectId(),
    bondId: bond._id,
    issuerId: bond.issuerId,
    kind,
    storageKey,
    fileName,
    contentType,
    sizeBytes: body.length,
    uploadedBy: adminId,
    createdAt: addDays(today, -faker.number.int({ min: 5, max: 90 })),
  };
  await documents.insertOne(doc);
}

// ── Perfil e2e: mínimo y estable ─────────────────────────────────────────────
async function seedE2E() {
  const admin = await upsertUser('admin@demo.local', 'Admin Demo', 'admin');
  const inv = [];
  for (let i = 1; i <= 3; i++)
    inv.push(await upsertUser(`investor${i}@demo.local`, `Inversor ${i}`, 'investor'));
  const aurora = await upsertIssuer('Aurora Energía', 'Energía', 'AA', false);
  const banco = await upsertIssuer('Banco Meridiano', 'Financiero', 'A-', false);
  const telecom = await upsertIssuer('Telecom Boreal', 'Telecomunicaciones', 'BBB', false);
  const base = { nominalCents: 100_000, totalUnits: 1_000, status: 'active' as const };
  const issue = addMonths(today, -2);

  const b1 = await insertBond({
    ...base,
    code: 'E2E-ACT-1',
    name: 'Aurora 2029 Fijo',
    issuer: aurora,
    couponType: 'fixed',
    couponRateBps: 600,
    frequency: 2,
    issueDate: issue,
    maturityDate: addMonths(issue, 48),
    priceBps: 9_800,
    availableUnits: 500,
  });
  const b2 = await insertBond({
    ...base,
    code: 'E2E-ACT-2',
    name: 'Meridiano 2027 Variable',
    issuer: banco,
    couponType: 'floating',
    referenceRateBps: 1100,
    spreadBps: 150,
    frequency: 4,
    issueDate: issue,
    maturityDate: addMonths(issue, 24),
    priceBps: 10_100,
    availableUnits: 500,
  });
  const b3 = await insertBond({
    ...base,
    code: 'E2E-ACT-3',
    name: 'Boreal 2036 Largo',
    issuer: telecom,
    couponType: 'fixed',
    couponRateBps: 950,
    frequency: 1,
    issueDate: issue,
    maturityDate: addMonths(issue, 120),
    priceBps: 9_500,
    availableUnits: 500,
  });
  for (const b of [b1, b2, b3]) if (b) await seedPriceHistory(b, b.marketPriceBps!, 0);
  if (b1) {
    await hold(b1, inv[0]._id, 50, 9_900, addDays(issue, 3));
    await addDocument(b1, admin._id, 'fiscal', 'constancia-fiscal.pdf', [
      'Constancia fiscal',
      b1.name,
    ]);
  }
  if (b2) await hold(b2, inv[1]._id, 30, 10_050, addDays(issue, 3));
  if (b3) await hold(b3, inv[2]._id, 20, 9_600, addDays(issue, 3));
  await insertBond({
    ...base,
    status: 'bookbuilding',
    code: 'E2E-BB-1',
    name: 'Aurora 2031 Libro',
    issuer: aurora,
    couponType: 'fixed',
    couponRateBps: 700,
    frequency: 2,
    issueDate: addDays(today, 30),
    maturityDate: addMonths(addDays(today, 30), 60),
    totalUnits: 100,
  });
}

// ── Perfiles dev / demo: completo ────────────────────────────────────────────
async function seedFull(profile: 'dev' | 'demo') {
  const investors: UserDoc[] = [];
  let adminId: ObjectId;
  if (profile === 'demo') {
    // Producción: no se crea admin (el real viene de ADMIN_EMAILS); los inversores salen de SEED_DEMO_INVESTORS.
    const emails = getEnv().SEED_DEMO_INVESTORS;
    if (emails.length === 0)
      throw new Error('El perfil demo requiere SEED_DEMO_INVESTORS (emails separados por coma).');
    for (const email of emails)
      investors.push(await upsertUser(email, email.split('@')[0], 'investor'));
    const existingAdmin = await (await col('users')).findOne({ role: 'admin' });
    adminId = existingAdmin?._id ?? new ObjectId(); // autor de los documentos de ejemplo
  } else {
    adminId = (await upsertUser('admin@demo.local', 'Admin Demo', 'admin'))._id;
    for (let i = 1; i <= 4; i++)
      investors.push(await upsertUser(`investor${i}@demo.local`, `Inversor ${i}`, 'investor'));
  }
  const admin = { _id: adminId };
  const issuers: IssuerDoc[] = [];
  for (const [name, sector, rating] of ISSUERS)
    issuers.push(await upsertIssuer(name, sector, rating, true));

  const freqs: Frequency[] = [2, 4, 12, 1, 2, 2, 4, 1];
  const termsMonths = [9, 36, 84, 24, 60, 120, 18, 48, 6, 72, 30, 96];
  const remaining = new Map<string, number>();
  const created: BondDoc[] = [];

  for (let i = 0; i < 24; i++) {
    const issuer = issuers[i % issuers.length];
    const rank = RATING_SCALE.indexOf(issuer.rating as never);
    const status: BondDoc['status'] = [0, 12].includes(i)
      ? 'draft'
      : [1, 7, 13, 19].includes(i)
        ? 'bookbuilding'
        : [5, 17].includes(i)
          ? 'matured'
          : 'active';
    const term = termsMonths[i % termsMonths.length];
    let issueDate: Date;
    let maturityDate: Date;
    if (status === 'draft') {
      issueDate = addDays(today, 45);
      maturityDate = addMonths(issueDate, term);
    } else if (status === 'bookbuilding') {
      issueDate = addDays(today, 20);
      maturityDate = addMonths(issueDate, term);
    } else if (status === 'matured') {
      issueDate = addMonths(today, -13);
      maturityDate = addDays(today, -35);
    } else {
      issueDate = addMonths(today, -faker.number.int({ min: 2, max: 12 }));
      maturityDate = addMonths(issueDate, Math.max(term, 18));
    }
    const floating = i % 4 === 3;
    const totalUnits = faker.number.int({ min: 5, max: 20 }) * 1000;
    const bond = await insertBond({
      code: `BC-${String(i + 1).padStart(3, '0')}`,
      name: `${BOND_NAMES[i % BOND_NAMES.length]} ${issuer.name.split(' ')[0]} ${maturityDate.getUTCFullYear()}`,
      issuer,
      couponType: floating ? 'floating' : 'fixed',
      couponRateBps: 550 + rank * 35 + faker.number.int({ min: 0, max: 10 }) * 5,
      referenceRateBps: 1100,
      spreadBps: 100 + rank * 25,
      frequency: freqs[i % freqs.length],
      nominalCents: i % 5 === 0 ? 500_000 : 100_000,
      issueDate,
      maturityDate,
      totalUnits,
      status,
      priceBps: 9_700 + faker.number.int({ min: 0, max: 6 }) * 100,
      availableUnits: Math.floor(totalUnits * 0.4),
    });
    if (!bond) continue;
    created.push(bond);
    remaining.set(
      bond._id.toHexString(),
      bond.availableUnits ? totalUnits - bond.availableUnits : 0,
    );

    if (bond.status === 'active') {
      // Dos bonos con salto de precio reciente (para el job de alertas de precio).
      await seedPriceHistory(bond, bond.marketPriceBps!, i % 7 === 0 ? 320 : 0);
      await (
        await col('covenants')
      ).insertMany([
        {
          _id: new ObjectId(),
          bondId: bond._id,
          description: 'Deuda neta / EBITDA máximo',
          metric: 'Deuda neta / EBITDA',
          threshold: '≤ 3.5x',
          status: i % 9 === 0 ? 'breach' : 'ok',
          lastCheckedAt: addDays(today, -10),
        },
        {
          _id: new ObjectId(),
          bondId: bond._id,
          description: 'Cobertura de intereses mínima',
          metric: 'EBITDA / Intereses',
          threshold: '≥ 2.5x',
          status: 'ok',
          lastCheckedAt: addDays(today, -10),
        },
      ]);
      if (i % 3 === 0) {
        await addDocument(bond, admin._id, 'fiscal', `fiscal-${bond.code}.pdf`, [
          'Constancia fiscal',
          bond.name,
          bond.code,
        ]);
        await addDocument(bond, admin._id, 'use_of_funds', `uso-fondos-${bond.code}.pdf`, [
          'Uso de fondos',
          bond.name,
        ]);
      }
    }
    if (bond.status === 'bookbuilding') {
      // Demanda ≈ 1.6–2.4× de lo ofertado, repartida entre inversores y niveles de precio.
      const orders: OrderDoc[] = [];
      let n = 0;
      for (const inv of investors) {
        const units = Math.floor(bond.totalUnits * faker.number.float({ min: 0.35, max: 0.6 }));
        orders.push({
          _id: new ObjectId(),
          bondId: bond._id,
          investorId: inv._id,
          units,
          limitPriceBps: 9_900 + faker.number.int({ min: 0, max: 4 }) * 25,
          status: 'pending',
          allocatedUnits: 0,
          createdAt: addDays(today, -(10 - n++)),
        });
      }
      await (await col('orders')).insertMany(orders);
    }
    if (bond.status === 'draft') continue;
  }

  if (created.length === 0) {
    log('los bonos ya existían: nada más que sembrar');
    return;
  }

  // Carteras: cada inversor reparte posiciones entre bonos vigentes (y alguno vencido ya cobrado).
  const active = created.filter((b) => b.status === 'active');
  const matured = created.filter((b) => b.status === 'matured');
  for (const [idx, inv] of investors.entries()) {
    const picks = faker.helpers.arrayElements(active, { min: 4, max: 6 });
    for (const bond of picks) {
      const room = remaining.get(bond._id.toHexString()) ?? 0;
      const units = Math.min(room, faker.number.int({ min: 20, max: 150 }));
      if (units <= 0) continue;
      remaining.set(bond._id.toHexString(), room - units);
      const acquiredAt = addDays(bond.issueDate, faker.number.int({ min: 1, max: 30 }));
      await hold(
        bond,
        inv._id,
        units,
        bond.finalPriceBps ?? 10_000,
        acquiredAt > today ? addDays(today, -1) : acquiredAt,
      );
    }
    const m = matured[idx % Math.max(1, matured.length)];
    if (m) await hold(m, inv._id, 40, 10_000, addDays(m.issueDate, 5), true);
  }
  // Ajusta el inventario secundario a lo no colocado.
  for (const [id, room] of remaining) {
    await (
      await col('bonds')
    ).updateOne(
      { _id: new ObjectId(id), status: 'active' },
      { $set: { availableUnits: Math.max(0, room) } },
    );
  }

  // Alertas de ejemplo (leídas y sin leer).
  const alerts: AlertDoc[] = [];
  for (const [idx, inv] of investors.entries()) {
    const sample = [
      {
        type: 'payment' as const,
        title: 'Cupón cobrado',
        detail: 'Se acreditó un cupón de tu cartera.',
        read: true,
      },
      {
        type: 'rating_change' as const,
        title: `Cambio de rating: ${issuers[idx].name}`,
        detail: `${issuers[idx].name} fue recalificado.`,
        read: false,
      },
      {
        type: 'price_move' as const,
        title: 'Movimiento de precio',
        detail: 'Un bono de tu cartera se movió más de tu umbral.',
        read: false,
      },
      {
        type: 'rebalance' as const,
        title: 'Conviene rebalancear tu cartera',
        detail: 'Un sector supera tu umbral de concentración.',
        read: true,
      },
    ];
    sample.forEach((a, k) =>
      alerts.push({
        _id: new ObjectId(),
        investorId: inv._id,
        type: a.type,
        payload: { title: a.title, detail: a.detail },
        dedupeKey: `seed:${idx}:${k}`,
        readAt: a.read ? addDays(today, -k) : null,
        emailedAt: null,
        createdAt: addDays(today, -(k + 1) * 3),
      }),
    );
  }
  await (await col('alerts')).insertMany(alerts);
}

async function main() {
  const env = getEnv();
  const reset = process.argv.includes('--reset');
  const profile = env.SEED_PROFILE;
  if (profile === 'demo' && !env.ALLOW_SEED) {
    throw new Error(
      'El perfil demo requiere ALLOW_SEED=true (protege contra siembras accidentales).',
    );
  }
  if (env.NODE_ENV === 'production' && !env.ALLOW_SEED && !env.E2E_MODE) {
    throw new Error('Seed en producción bloqueado: define ALLOW_SEED=true de forma explícita.');
  }
  if (reset && profile === 'demo')
    throw new Error('seed:reset está prohibido con el perfil demo (no borra datos reales).');

  faker.seed(20_260_101);
  const db = await getDb();
  if (reset) {
    const names = (await db.listCollections().toArray()).map((c) => c.name);
    await Promise.all(names.map((n) => db.collection(n).deleteMany({})));
    log(`base "${db.databaseName}" vaciada`);
  }
  const target = new URL(env.MONGODB_URI.replace(/^mongodb(\+srv)?:/, 'http:'));
  log(`destino: ${target.hostname} / base ${db.databaseName} (sin credenciales)`);
  log(`perfil ${profile} (${env.E2E_MODE ? 'E2E' : 'normal'})`);
  const COLS = [
    'users',
    'issuers',
    'bonds',
    'positions',
    'scheduledPayments',
    'orders',
    'alerts',
    'documents',
  ];
  const before = Object.fromEntries(
    await Promise.all(COLS.map(async (n) => [n, await db.collection(n).countDocuments()])),
  );
  if (profile === 'e2e') await seedE2E();
  else await seedFull(profile);
  const after = Object.fromEntries(
    await Promise.all(COLS.map(async (n) => [n, await db.collection(n).countDocuments()])),
  );
  const created = Object.fromEntries(COLS.map((n) => [n, after[n] - before[n]]));
  log(`creados ${JSON.stringify(created)}`);
  log(`totales ${JSON.stringify(after)}`);
  if (profile === 'demo') {
    const users = await (
      await col('users')
    )
      .find({ email: { $in: env.SEED_DEMO_INVESTORS } })
      .toArray();
    log(`inversores demo: ${users.map((u) => u.email).join(', ')}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
