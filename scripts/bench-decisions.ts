/**
 * Mediciones que respaldan las decisiones técnicas (docs/informe-calidad.md).
 * Uso: pnpm exec tsx --env-file-if-exists=.env.local scripts/bench-decisions.ts
 * Usa una base temporal (bonds_bench_*) que elimina al terminar. No toca datos reales.
 */
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

Object.assign(process.env, {
  AUTH_SECRET: 'bench-secret-bench-secret-bench-secret-123',
  CRON_SECRET: 'bench-cron',
  MONGODB_DB: `bonds_bench_${randomUUID().slice(0, 6)}`,
  MAIL_DRIVER: 'memory',
  STORAGE_DRIVER: 'fs',
  STORAGE_FS_DIR: '.tmp/bench-storage',
  E2E_MODE: 'true',
  NODE_ENV: 'development',
});

// PRNG determinista (mulberry32) para que las cifras sean reproducibles.
let seed = 20_260_101;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
const out: Record<string, unknown> = {};

async function main() {
  const { mulDiv } = await import('@/lib/money');
  const { generateSchedule } = await import('@/lib/domain/schedule');
  const { ytmFromPrice, priceFromYtm } = await import('@/lib/domain/ytm');
  const { allocate } = await import('@/lib/domain/bookbuilding');
  const { parseISODate } = await import('@/lib/domain/dates');

  // ── A1. Deriva de coma flotante al acumular importes ─────────────────────────
  {
    const N = 1_000_000;
    let f = 0;
    let c = 0;
    for (let i = 0; i < N; i++) {
      f += 0.1; // 10 centavos como decimal
      c += 10; // 10 centavos como entero
    }
    out.A1_float_drift = {
      pagos: N,
      esperado_centavos: N * 10,
      entero: c,
      flotante_centavos: f * 100,
      error_centavos: Math.abs(f * 100 - N * 10),
    };
  }

  // ── A2. mulDiv (BigInt) vs Math.round(a*b/c) con operandos grandes ────────────
  {
    const N = 1_000_000;
    let mismatch = 0;
    let overflow = 0;
    let maxErr = 0n;
    for (let i = 0; i < N; i++) {
      const a = int(1, 1_000_000) * int(10_000, 1_000_000_000); // títulos × nominal (centavos)
      const b = int(1_000, 30_000); // precio bps
      const exact = BigInt(mulDiv(a, b, 10_000));
      if (a * b > Number.MAX_SAFE_INTEGER) overflow++;
      const naive = BigInt(Math.round((a * b) / 10_000));
      if (naive !== exact) {
        mismatch++;
        const d = naive > exact ? naive - exact : exact - naive;
        if (d > maxErr) maxErr = d;
      }
    }
    out.A2_mulDiv_vs_naive = {
      muestras: N,
      productos_sobre_2_53: overflow,
      resultados_distintos: mismatch,
      pct_distintos: +((mismatch / N) * 100).toFixed(2),
      error_max_centavos: Number(maxErr),
    };
  }

  // ── A3. Sesgo del redondeo: half-up vs half-even en empates (.5) ──────────────
  {
    const N = 1_000_000;
    let up = 0;
    let even = 0;
    let exact = 0;
    for (let i = 0; i < N; i++) {
      const n = 2 * int(0, 1_000_000) + 1; // n/2 siempre termina en .5
      exact += n / 2;
      up += Math.floor(n / 2 + 0.5); // half-up
      even += mulDiv(n, 1, 2); // half-even (función única del proyecto)
    }
    out.A3_rounding_bias = {
      empates: N,
      sesgo_half_up_centavos: up - exact,
      sesgo_half_even_centavos: even - exact,
    };
  }

  // ── B. YTM: convergencia, error de ida y vuelta y latencia ────────────────────
  {
    const N = 20_000;
    let ok = 0;
    let nulls = 0;
    const errs: number[] = [];
    const t0 = performance.now();
    let solves = 0;
    let solveMs = 0;
    for (let i = 0; i < N; i++) {
      const freq = [12, 4, 2, 1][int(0, 3)] as 12 | 4 | 2 | 1;
      const years = int(1, 15);
      const issue = parseISODate('2026-01-15');
      const maturity = parseISODate(`${2026 + years}-01-15`);
      const rate = int(200, 1800);
      const flows = generateSchedule({
        nominalCents: 100_000,
        annualRateBps: rate,
        frequency: freq,
        dayCount: '30/360',
        issueDate: issue,
        maturityDate: maturity,
      });
      const price = int(5_000, 13_000);
      const s0 = performance.now();
      const y = ytmFromPrice(flows, 100_000, price, issue, freq);
      solveMs += performance.now() - s0;
      solves++;
      if (y === null) {
        nulls++;
        continue;
      }
      ok++;
      errs.push(Math.abs(priceFromYtm(flows, 100_000, y, issue, freq) - price));
    }
    out.B_ytm = {
      casos: N,
      convergen: ok,
      sin_solucion_null: nulls,
      error_precio_bps_p50: pct(errs, 0.5),
      error_precio_bps_p99: pct(errs, 0.99),
      error_precio_bps_max: Math.max(...errs),
      latencia_media_us: +((solveMs / solves) * 1000).toFixed(1),
      tiempo_total_ms: Math.round(performance.now() - t0),
    };
  }

  // ── C. Adjudicación: invariante y desviación respecto del prorrateo ideal ─────
  {
    const N = 20_000;
    let violations = 0;
    let maxDev = 0;
    let over = 0;
    for (let i = 0; i < N; i++) {
      const n = int(1, 40);
      const orders = Array.from({ length: n }, (_, k) => ({
        id: `o${k}`,
        units: int(1, 500),
        limitPriceBps: 9_900 + int(0, 4) * 25,
        createdAt: new Date(2026, 0, 1, 0, 0, k),
      }));
      const offered = int(10, 3_000);
      const final = 9_900 + int(0, 4) * 25;
      const res = allocate(orders, final, offered);
      const elig = orders.filter((o) => o.limitPriceBps >= final);
      const demand = elig.reduce((s, o) => s + o.units, 0);
      const total = res.reduce((s, r) => s + r.allocatedUnits, 0);
      if (total !== Math.min(offered, demand)) violations++;
      if (demand > offered) {
        for (const o of elig) {
          const got = res.find((r) => r.id === o.id)!.allocatedUnits;
          maxDev = Math.max(maxDev, Math.abs(got - (o.units * offered) / demand));
          if (got > o.units) over++;
        }
      }
    }
    const big = Array.from({ length: 10_000 }, (_, k) => ({
      id: `o${k}`,
      units: int(1, 500),
      limitPriceBps: 10_000,
      createdAt: new Date(2026, 0, 1, 0, 0, 0, k),
    }));
    const t = performance.now();
    allocate(big, 10_000, 1_000_000);
    out.C_allocation = {
      libros: N,
      violaciones_invariante: violations,
      adjudicado_sobre_lo_pedido: over,
      desviacion_max_vs_prorrateo_ideal_titulos: +maxDev.toFixed(3),
      ms_para_10000_ordenes: +(performance.now() - t).toFixed(1),
    };
  }

  // ── D/E/F: MongoDB real ────────────────────────────────────────────────────────
  const { getDb, closeDb, col, ensureIndexes } = await import('@/lib/db');
  const { ObjectId } = await import('mongodb');
  const db = await getDb();
  try {
    // D1. Índices sobre scheduledPayments con 300 000 documentos.
    const pays = db.collection('scheduledPayments');
    await pays.drop().catch(() => undefined);
    const investors = Array.from({ length: 2_000 }, () => new ObjectId());
    const bonds = Array.from({ length: 200 }, () => new ObjectId());
    const base = Date.UTC(2025, 0, 1);
    const docs = Array.from({ length: 300_000 }, (_, i) => {
      const dueDate = new Date(base + int(0, 1500) * 86_400_000);
      return {
        _id: new ObjectId(),
        bondId: bonds[i % 200],
        investorId: investors[i % 2_000],
        type: 'coupon',
        dueDate,
        amountCents: int(1_000, 90_000),
        status: dueDate < new Date(Date.UTC(2026, 9, 1)) ? 'paid' : 'scheduled',
        paidAt: null,
      };
    });
    for (let i = 0; i < docs.length; i += 50_000)
      await pays.insertMany(docs.slice(i, i + 50_000), { ordered: false });
    const asOf = new Date(Date.UTC(2026, 9, 3));
    const run = async (filter: object, sort: object) => {
      const e = await pays
        .find(filter)
        .sort(sort as never)
        .limit(100)
        .explain('executionStats');
      const s = (
        e as {
          executionStats: {
            totalDocsExamined: number;
            executionTimeMillis: number;
            nReturned: number;
          };
        }
      ).executionStats;
      return {
        docs_examinados: s.totalDocsExamined,
        ms: s.executionTimeMillis,
        devueltos: s.nReturned,
      };
    };
    const jobFilter = { status: 'scheduled', dueDate: { $lte: asOf } };
    const dashFilter = { investorId: investors[7], status: 'scheduled', dueDate: { $gte: asOf } };
    const sin = {
      job: await run(jobFilter, { dueDate: 1 }),
      tablero: await run(dashFilter, { dueDate: 1 }),
    };
    await pays.createIndex({ status: 1, dueDate: 1 });
    await pays.createIndex({ investorId: 1, status: 1, dueDate: 1 });
    const con = {
      job: await run(jobFilter, { dueDate: 1 }),
      tablero: await run(dashFilter, { dueDate: 1 }),
    };
    out.D1_indices_300k_pagos = { sin_indice: sin, con_indice: con };

    // D2. Idempotencia: dos procesos compitiendo por los mismos pagos.
    const due = await pays
      .find({ status: 'scheduled', dueDate: { $lte: new Date(Date.UTC(2026, 11, 31)) } })
      .project({ _id: 1 })
      .toArray();
    const target = due.slice(0, 20_000).map((d) => d._id);
    const worker = async (atomic: boolean) => {
      let changed = 0;
      for (const id of target) {
        if (atomic) {
          changed += (
            await pays.updateOne({ _id: id, status: 'scheduled' }, { $set: { status: 'paid' } })
          ).modifiedCount;
        } else {
          const cur = await pays.findOne({ _id: id }, { projection: { status: 1 } });
          if (cur?.status === 'scheduled') {
            await pays.updateOne({ _id: id }, { $set: { status: 'paid' } });
            changed++;
          }
        }
      }
      return changed;
    };
    const resetTarget = () =>
      pays.updateMany({ _id: { $in: target } }, { $set: { status: 'scheduled' } });
    await resetTarget();
    const naive = (await Promise.all([worker(false), worker(false)])).reduce((a, b) => a + b, 0);
    await resetTarget();
    const atomic = (await Promise.all([worker(true), worker(true)])).reduce((a, b) => a + b, 0);
    out.D2_idempotencia_2_procesos_concurrentes = {
      pagos: target.length,
      cobrados_lectura_y_escritura: naive,
      cobrados_actualizacion_atomica: atomic,
    };
    await pays.drop();
    await ensureIndexes(db);

    // E + F. Libro en vivo (payload de polling) y coste de la transacción de adjudicación.
    const { createIssuer } = await import('@/lib/repositories/issuers');
    const { upsertUserOnLogin } = await import('@/lib/repositories/users');
    const { createBond, openBookbuilding } = await import('@/lib/services/bonds');
    const { placeOrder, getBook, closeAndAllocate } = await import('@/lib/services/bookbuilding');
    const { bondSchema } = await import('@/lib/validation');
    const admin = await upsertUserOnLogin('bench-admin@x.com');
    const issuer = await createIssuer({
      name: 'Bench',
      sector: 'Energía',
      country: 'México',
      rating: 'AA',
      agency: 'S&P',
    });
    const mk = async (code: string, issueDate: string, maturityDate: string, freq: number) =>
      createBond(
        admin._id,
        bondSchema.parse({
          issuerId: issuer._id.toHexString(),
          name: code,
          code,
          nominalCents: 100_000,
          couponType: 'fixed',
          couponRateBps: 700,
          frequency: freq,
          dayCount: '30/360',
          issueDate,
          maturityDate,
          totalUnits: 100_000,
        }),
      );
    const invs = [];
    for (let i = 0; i < 500; i++) invs.push(await upsertUserOnLogin(`bench-inv-${i}@x.com`));
    const payloads: Record<string, number> = {};
    const txs: Record<string, unknown> = {};
    for (const n of [10, 100, 500]) {
      const bond = await mk(`BENCH-${n}`, '2031-01-15', '2036-01-15', 2);
      await openBookbuilding(admin._id, bond._id);
      for (let i = 0; i < n; i++)
        await placeOrder(invs[i % invs.length]._id, {
          bondId: bond._id,
          units: int(10, 400),
          limitPriceBps: 9_900 + int(0, 4) * 25,
        });
      payloads[`${n}_ordenes`] = Buffer.byteLength(JSON.stringify(await getBook(bond._id)));
      const t = performance.now();
      await closeAndAllocate(admin._id, bond._id, 9_950);
      const ms = Math.round(performance.now() - t);
      const pc = await (await col('scheduledPayments')).countDocuments({ bondId: bond._id });
      txs[`${n}_ordenes`] = { ms_transaccion: ms, pagos_persistidos: pc };
    }
    out.E_polling_libro = { bytes_por_respuesta: payloads, peticiones_por_minuto_a_3s: 20 };
    out.F_transaccion_adjudicacion = txs;
  } finally {
    await db.dropDatabase();
    await closeDb();
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
