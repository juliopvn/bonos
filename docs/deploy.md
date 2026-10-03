# Despliegue a producción

```
GitLab self-hosted (origen + CI)  ──mirror manual──►  GitHub (espejo)  ──integración Git──►  Vercel (CD)
```

- El origen y el **CI viven en GitLab** (`.gitlab-ci.yml`). No hay workflows en `.github/`.
- Tú haces **a mano** el mirror a GitHub, el proyecto en Vercel y la carga de variables. Nada de esto está automatizado.
- **Regla de proceso:** Vercel despliega todo lo que llega al espejo sin conocer el estado del pipeline. Empuja a `main` del espejo **solo con el pipeline de GitLab en verde** y con `pnpm verify` en verde en local.

## Nombres sugeridos

| Recurso | Production | Preview |
|---|---|---|
| Base de datos (cluster existente de Atlas) | `bonos_prod` | `bonos_preview` |
| Usuario de Atlas | `bonos-app` (readWrite solo sobre `bonos_prod` y `bonos_preview`) | — |
| Bucket R2 | `bonos-docs-prod` | `bonos-docs-preview` |
| API token de R2 | `bonos-app-r2` (Object Read & Write, limitado a ambos buckets) | — |
| API key de Resend | `bonos-app` (*Sending access*, limitada al dominio) | — |
| Remitente | `Bonos <no-reply@jpavon-tech.com>` | igual |
| Proyecto Vercel | `bonos` | — |
| Dominio | `bonos.jpavon-tech.com` | URL `*.vercel.app` de cada preview |

## Checklist (a cargo del usuario)

**MongoDB Atlas**
1. Database Access → usuario `bonos-app` con rol `readWrite` sobre `bonos_prod` y `bonos_preview`.
2. Network Access → permitir Vercel (IPs dinámicas: `0.0.0.0/0` con contraseña fuerte, o la integración Vercel–Atlas).
3. Copia el connection string `mongodb+srv://…` (las bases se crean solas al primer uso).
4. Desde local, con el `.env` de producción: `pnpm db:indexes` contra `bonos_prod` y contra `bonos_preview` (en producción los índices **no** se crean solos).

**Cloudflare R2**
5. Crea `bonos-docs-prod` y `bonos-docs-preview`, privados (sin acceso público ni dominio público).
6. Crea el token `bonos-app-r2` (Object Read & Write) limitado a esos dos buckets; anota Access Key ID, Secret y el endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
7. CORS: **no hace falta**. La subida pasa por el servidor (multipart a `/api/admin/documents`) y la descarga es una redirección 302 a una URL prefirmada.

**Resend**
8. Confirma que `jpavon-tech.com` aparece como *Verified*.
9. Crea la API key `bonos-app` con *Sending access* limitada a ese dominio.

**Vercel**
10. Mirror GitLab → GitHub (con el pipeline de `main` en verde).
11. Crea el proyecto `bonos` importando el repo de GitHub: framework Next.js, install `pnpm install`, build `pnpm build`, Node 24. (`vercel.json` ya fija install/build y los crons.)
12. Carga las variables de la tabla de abajo en **Production** y **Preview**.
13. Primer deploy.

**Dominio (Cloudflare DNS + Vercel)**
14. Vercel → Project → Domains → añade `bonos.jpavon-tech.com`.
15. Cloudflare DNS → `CNAME bonos` hacia el destino que indique Vercel, en **DNS only** (nube gris).
16. Espera a que Vercel valide el dominio y emita el certificado; márcalo como dominio de Production.
17. En Domains, configura la **redirección de la URL `*.vercel.app` de producción hacia `bonos.jpavon-tech.com`** (las previews no se redirigen).

**Datos y verificación**
18. Desde local, con las variables de producción: `ALLOW_SEED=true SEED_PROFILE=demo pnpm seed` (**una sola vez**; es solo-inserción, `seed:reset` está prohibido con `demo`).
19. Ejecuta el job manual `smoke:production` en GitLab, o `BASE_URL=https://bonos.jpavon-tech.com pnpm test:smoke`.

## Variables de entorno (Vercel)

| Variable | Production | Preview |
|---|---|---|
| `APP_URL` | `https://bonos.jpavon-tech.com` | vacío: la app usa `https://$VERCEL_URL` |
| `AUTH_SECRET` | nuevo, ≥ 32 bytes (`openssl rand -base64 48`) | otro distinto |
| `CRON_SECRET` | nuevo (`openssl rand -hex 32`) | otro distinto |
| `ADMIN_EMAILS` | `<ADMIN_EMAIL>` | igual o el de pruebas |
| `MONGODB_URI` | connection string de Atlas (`bonos-app`) | igual |
| `MONGODB_DB` | `bonos_prod` | `bonos_preview` |
| `MAIL_DRIVER` | `resend` | `resend` |
| `MAIL_FROM` | `Bonos <no-reply@jpavon-tech.com>` | igual |
| `RESEND_API_KEY` | key `bonos-app` | igual |
| `STORAGE_DRIVER` | `s3` | `s3` |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | igual |
| `S3_REGION` | `auto` | `auto` |
| `S3_BUCKET` | `bonos-docs-prod` | `bonos-docs-preview` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | token `bonos-app-r2` | igual |
| `S3_FORCE_PATH_STYLE` | `true` | `true` |
| `ALERT_PRICE_MOVE_BPS` / `ALERT_CONCENTRATION_PCT` | `200` / `30` | igual |
| `E2E_MODE` | `false` | `false` |
| `ALLOW_SEED` | `false` | `false` |

Notas:
- `lib/env.ts` cae a `https://${VERCEL_URL}` cuando falta `APP_URL`, para que los magic links funcionen en previews.
- Con `NODE_ENV=production` la app **rechaza al arrancar** `MAIL_DRIVER=memory` y `STORAGE_DRIVER=fs` si `E2E_MODE` no es `true`.
- Si añades `SMTP_*`/`MAILHOG_*` en Vercel no hacen falta: solo aplican a `MAIL_DRIVER=smtp`.

## CD y crons

- Production branch = `main`. Cualquier otra rama que llegue al espejo genera un **Preview** con su propia base y bucket.
- `vercel.json` define dos crons diarios (compatibles con cualquier plan), hora de México (UTC−6, sin horario de verano) expresada en UTC:
  - pagos: `0 12 * * *` → 06:00
  - alertas: `15 12 * * *` → 06:15
- Vercel Cron llama con `GET` y la cabecera `Authorization: Bearer $CRON_SECRET` (se envía sola cuando `CRON_SECRET` está definido). Los endpoints también aceptan `POST` para ejecuciones manuales.
- Frecuencia mayor (planes Pro): edita `schedule` (p. ej. `*/30 * * * *`). Los jobs son idempotentes, así que ejecutarlos más veces no duplica pagos ni alertas.
- Conexiones Mongo en serverless: `lib/db.ts` guarda el `MongoClient` en `globalThis` y lo reutiliza entre invocaciones calientes (pool de 10). En Atlas M0 (límite de 500 conexiones) basta; si creces, usa la integración Vercel–Atlas.
- Revisa los logs de Vercel tras el primer cron (`/api/cron/payments` debe responder 200 con `{activated, paid, matured}`).

## Smoke de producción

`e2e/smoke` (login carga, `/api/health` ok, rutas protegidas redirigen, cabeceras de seguridad, `/api/test/*` → 404). En GitLab: job manual `smoke:production` con la variable `BASE_URL`. Los flujos con correo completo se cubren en CI con MailHog/`memory`.

## Runner de CI y resumen de iteraciones

Resumen (detalle y bitácora en `docs/ci-notes.md`): runner `cloudrun-ephemeral` con tag obligatorio `cloudrun`, sin Docker ni `services:`, Node 22 (ignora `image:`). Pipeline `quality → test → build → e2e` en verde; el E2E corre sin contenedores (Mongo en memoria, correo `memory`, storage `fs`) y sin `allow_failure`. Job manual `smoke:production` con `BASE_URL`.
