<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Plataforma de emisión y gestión de bonos corporativos

## 1. Resumen

Plataforma web (Next.js 16 + TypeScript + Tailwind + MongoDB) para **estructurar emisiones de bonos, gestionar el bookbuilding, automatizar pagos de cupón/principal** y dar a los inversores **screener, tablero de posición y alertas**.

- **admin**: emisores y ratings, emisiones (calendario de flujos), libro de órdenes en vivo y adjudicación, calendario de pagos, cumplimiento (documentos, covenants, reportes CSV).
- **investor**: screener (rating, YTM, vencimiento, sector), compra (orden en bookbuilding / compra secundaria), tablero de cartera, órdenes, documentos de sus bonos, alertas y preferencias.

Spec completa y fases: `PROMPT.md`. Decisiones tomadas: `docs/decisions.md`. `README.md` es del enunciado: **no se toca** (salvo la sección de despliegue en la Fase B6).

## 2. Comandos

| Objetivo                               | Comando                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Setup                                  | `nvm use` (Node 24) · `pnpm install` · `cp .env.example .env.local`                                |
| Servicios (Mongo rs0, MailHog, RustFS) | `pnpm services:up` / `pnpm services:down`                                                          |
| Desarrollo                             | `pnpm dev` → http://localhost:3000 (correos en http://localhost:8025)                              |
| Seed                                   | `pnpm seed` (idempotente) · `pnpm seed:reset` (borra TODA la base) · `SEED_PROFILE=e2e\|dev\|demo` |
| Índices                                | `pnpm db:indexes`                                                                                  |
| Jobs                                   | `pnpm jobs:run [--date=YYYY-MM-DD] [--only=payments\|alerts]`                                      |
| Calidad                                | `pnpm lint` · `pnpm typecheck` · `pnpm format`                                                     |
| Tests                                  | `pnpm test` (unit + integración) · `pnpm test:cov` · `pnpm test:e2e` · `pnpm test:smoke`           |
| Verificación completa                  | `pnpm verify` (lint + typecheck + test + servicios + E2E)                                          |
| Build                                  | `pnpm build` · `pnpm start`                                                                        |

Usuarios del seed: `admin@demo.local`, `investor1..4@demo.local` (el magic link llega a MailHog).

> Si el puerto 27017 del host está ocupado (p. ej. `mongod` de Homebrew), crea `.env` con `MONGO_PORT=27018` y usa ese puerto en `MONGODB_URI` de `.env.local`.

## 3. Mapa del repositorio

```
app/                 Rutas (App Router). (auth)/login|verify · admin/… · investor/… · api/…
  api/admin/*        Solo rol admin (requireRole('admin')) · api/cron/* (Bearer CRON_SECRET) · api/test/* (solo E2E_MODE)
components/          UI reutilizable (AppShell, ui.tsx, charts.tsx, ScheduleTable, Guilloche)
context/             GlobalContext (usuario, rol, alertas sin leer, toasts)
lib/
  env.ts             Validación zod de variables (falla al arrancar)
  db.ts              Singleton MongoClient (globalThis) + índices idempotentes + getMongoClient() para transacciones
  money.ts bps.ts    Aritmética entera, redondeo único, formato
  domain/            Lógica pura y probada: schedule, ytm, valuation, bookbuilding, alerts, rating, term, dates
  repositories/      Acceso a datos (issuers, bonds, users, alerts)
  services/          Orquestación: bonds, bookbuilding, trading, portfolio, screener, alerts, documents, reports, admin
  jobs/payments.ts   Job de pagos (idempotente)
  auth/              jwt (jose), session (cookie), guards, magic-link
  mailer/ storage/   Adaptadores intercambiables por entorno
  validation/        Esquemas zod de toda entrada
proxy.ts             Primera barrera de navegación (NO es la única)
scripts/             seed.ts, jobs.ts, create-indexes.ts, e2e-server.ts
tests/unit|integration  Vitest (integración contra Mongo real con replica set)
e2e/                 Playwright (+ support/mailbox.ts, auth.ts, jobs.ts) y e2e/smoke
docs/decisions.md    ADRs cortos
```

## 4. Reglas de dominio no negociables

1. **Importes en céntimos y tasas/precios en bps, siempre enteros.** Nada de `number` con decimales para dinero. Conversión de entrada con `parseMoneyToCents` / `percentToBps` (sin coma flotante).
2. **Una sola función de redondeo**: `mulDiv`/`divRound` (half-even, BigInt interno) en `lib/money.ts`. Prohibido `Math.round(a / b)` para dinero.
3. **Los pagos se persisten** en `scheduledPayments` al adjudicar/comprar, derivados del bono (`generateSchedule`). Un documento por (bono, inversor, tipo, fecha), acumulado con `$inc`.
4. **La adjudicación y la compra secundaria van en transacción** (`session.withTransaction`). Por eso Mongo local es un replica set.
5. **Los jobs son idempotentes** (actualización atómica condicionada a `status: 'scheduled'`; alertas con clave de deduplicación).
6. Precio = bps del nominal (`10000` = a la par). Importe = títulos × nominal × precio / 10000.
7. El plazo (`term`) se deriva de emisión→vencimiento; no se edita a mano.

## 5. Reglas de seguridad

- **Toda autorización se valida en servidor**: `requireSession()` / `requireRole()` en API Routes, `requirePageRole()` en Server Components. `proxy.ts` solo redirige; no lo trates como barrera de seguridad.
- **Zod en toda entrada** (`lib/validation`). Los route handlers van envueltos en `route()` (`lib/http.ts`) para devolver errores JSON coherentes.
- El inversor solo ve **lo suyo**: órdenes, posiciones, pagos y documentos de bonos que posee (verificado en servidor).
- No exponer secretos al cliente (no usar `NEXT_PUBLIC_` para claves). Cabeceras de seguridad y CSP en `next.config.ts`.
- Magic link: JWT HS256 de 15 min, `jti` de un solo uso (consumo atómico), respuesta idéntica exista o no el correo, rate limit por correo/IP.
- Descargas: autorizar → URL prefirmada de corta duración (S3/R2) o firmada por la app (driver `fs`).

## 6. Convenciones

- TypeScript estricto; sin `any`. Server Components por defecto; `'use client'` solo donde hay estado/eventos.
- **Nada de consultas Mongo en componentes**: usa repositorios/servicios (`lib/repositories`, `lib/services`). Los componentes cliente llaman a API Routes con `lib/client-api.ts`.
- Datos de servidor → cliente: `plain()` / `Plain<T>` (ObjectId y Date → string).
- `data-testid` en elementos que usa el E2E. Español neutro en UI; mensajes de error dicen qué pasó y cómo corregirlo.
- Estilo: Prettier (`pnpm format`). Sistema visual en `app/globals.css` (tema "título valor": papel verdoso, tinta, dorado; cupón desprendible como firma).
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `ci:`). Trabajo por fases; no avances con pruebas en rojo.

## 7. Testing

| Nivel       | Qué prueba                                                                                                      | Dónde                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Unit        | Aritmética, calendario de flujos, YTM, bookbuilding, valoración, alertas, env                                   | `tests/unit` (cobertura ≥ 90 % en `lib/domain` y `lib/money`: `pnpm test:cov`) |
| Integración | Servicios contra **Mongo real** (replica set): adjudicación, jobs, alertas, tablero, screener, documentos, auth | `tests/integration` (usa Mongo docker; si no está, `mongodb-memory-server`)    |
| E2E         | Los 9 flujos de negocio con Chromium + viewport móvil                                                           | `e2e/`                                                                         |

**Dos modos de E2E (misma suite):**

- _Local con Docker_ (por defecto): `E2E_MAILBOX=mailhog`, Mongo/RustFS/MailHog reales. Base `bonds_e2e` (no toca la de desarrollo), build en `.next-e2e`, puerto 3100.
- _CI sin Docker_: `E2E_MAILBOX=memory E2E_MONGO=memory` → `mongodb-memory-server` + `MAIL_DRIVER=memory` + `STORAGE_DRIVER=fs` + `E2E_MODE=true`.

Cómo leer correos: `e2e/support/mailbox.ts` (`waitForMail`, `magicLinkFrom`). En modo memory lee `GET /api/test/mailbox`, que **solo existe con `E2E_MODE=true`** (404 si no).
Cómo simular fechas: `pnpm jobs:run --date=YYYY-MM-DD`; en E2E, `runCron(request, 'payments', 'YYYY-MM-DD')` (el parámetro `date` solo se acepta fuera de producción o con `E2E_MODE`).
`globalSetup` ejecuta `seed:reset` con `SEED_PROFILE=e2e` y guarda un `storageState` por rol. Los tests no dependen del orden entre archivos (cada uno crea sus datos o restaura lo que cambia). Workers: 1.
**`pnpm verify` es la verificación obligatoria en local** antes de empujar al mirror (más aún si el E2E de CI quedó con `allow_failure`).

## 8. Entornos

| Pieza         | Local                        | Producción                                             |
| ------------- | ---------------------------- | ------------------------------------------------------ |
| Base de datos | Mongo 7 docker (rs0)         | MongoDB Atlas                                          |
| Correo        | MailHog (`MAIL_DRIVER=smtp`) | Resend (`MAIL_DRIVER=resend`)                          |
| Storage       | RustFS (`STORAGE_DRIVER=s3`) | Cloudflare R2 (`s3`, `S3_REGION=auto`)                 |
| Jobs          | `pnpm jobs:run`              | Vercel Cron → `/api/cron/payments`, `/api/cron/alerts` |
| CI            | —                            | `memory` / `fs` solo con `E2E_MODE=true`               |

Variables (todas validadas en `lib/env.ts`, plantilla en `.env.example`): `APP_URL` (cae a `https://$VERCEL_URL`), `AUTH_SECRET`, `MAGIC_LINK_TTL_MINUTES`, `SESSION_TTL_DAYS`, `ADMIN_EMAILS`, `AUTH_RATE_LIMIT_MAX`, `MONGODB_URI`, `MONGODB_DB`, `MAIL_DRIVER`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `MAILHOG_API_URL`, `RESEND_API_KEY`, `STORAGE_DRIVER`, `STORAGE_FS_DIR`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PRESIGNED_TTL_SECONDS`, `CRON_SECRET`, `ALERT_PRICE_MOVE_BPS`, `ALERT_CONCENTRATION_PCT`, `SEED_PROFILE`, `ALLOW_SEED`, `BASE_URL`, `E2E_MODE`, `E2E_MAILBOX`, `E2E_MONGO`. Los drivers `memory`/`fs` se rechazan al arrancar con `NODE_ENV=production` salvo `E2E_MODE=true`.

## 9. CI/CD (Bloque B — pendiente de confirmación)

El CI vivirá en **GitLab** (`.gitlab-ci.yml`) y se ajustará iterativamente al runner real (`docs/ci-notes.md`). GitHub es **solo un espejo** para Vercel: **no crear `.github/workflows`**. Se empuja al mirror únicamente con el pipeline de GitLab en verde. Si el E2E de CI queda con `allow_failure`, la verificación real es `pnpm verify` en local antes de cada mirror.

## 10. Prohibiciones

- No crear/sobrescribir `README.md` (solo añadir la sección de despliegue en B6).
- No commitear `.env`, `.env.local` ni secretos (solo `.env.example`).
- No ejecutar seeds destructivos contra producción (`seed:reset` está prohibido con el perfil `demo`; `demo` exige `ALLOW_SEED=true`).
- No usar `number` decimal para dinero ni redondear fuera de `lib/money.ts`.
- No confiar en `proxy.ts` ni en el cliente para autorizar.
