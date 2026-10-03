# Notas de CI (GitLab self-hosted)

## Runner real (diagnóstico del pipeline #3708, 2026-10-03)

| Capacidad | ¿Disponible? | Evidencia |
|---|---|---|
| Runner que toma jobs | Solo con tag `cloudrun` | `runners/3`: `run_untagged=false`. El runner `vps-dind-shared` está `stale`/offline. Sin tag los jobs quedaron en *pending* >20 min |
| Imagen pedida (`image: node:24-bookworm`) | **No se respeta** | El job corrió en Ubuntu 24.04 con Node **v22.22.3**, kernel 6.9.12, `desc=cloudrun-ephemeral` |
| Recursos | Sí, holgados | 6 vCPU, 16 GB RAM, disco 16 GB, `/dev/shm` 7.9 GB |
| pnpm | No preinstalado | `pnpm: command not found`; `corepack 0.34.6` presente |
| Docker (socket o dind) | **No** | `docker: command not found` |
| `services:` | **No** | `diagnose:services`: `getaddrinfo EAI_AGAIN mongo` |
| Salida a internet | Sí | `registry.npmjs.org` 200, `fastdl.mongodb.org` 200, `cdn.playwright.dev` 400 (HEAD en raíz; responde), `playwright.azureedge.net` 307 |
| Proxy | No | `env | grep proxy` solo muestra variables del dependency proxy de GitLab |

### Estrategia de E2E elegida
Sin Docker ni `services:` pero con internet → **modo sin contenedores**: `mongodb-memory-server` (replica set), `MAIL_DRIVER=memory`, `STORAGE_DRIVER=fs`, `E2E_MODE=true`, Chromium instalado por Playwright (`E2E_MAILBOX=memory E2E_MONGO=memory`). Es el mismo modo que ya pasa en local.

## Bitácora de iteraciones

### Intento 1 — 2026-10-03
- Job / stage: `diagnose`
- Error observado: el pipeline no creó jobs (`mapping values are not allowed in this context at line 34`)
- Hipótesis: `: ` dentro de escalares YAML planos en `script`
- Cambio aplicado: scripts como bloques `|`; validado con `POST /ci/lint` antes de empujar
- Resultado: YAML válido

### Intento 2 — 2026-10-03
- Job / stage: `diagnose`
- Error observado: jobs *pending* indefinidamente, sin runner asignado
- Hipótesis: el único runner online exige tag (`run_untagged=false`, tag `cloudrun`)
- Cambio aplicado: `default: tags: [cloudrun]`
- Resultado: jobs ejecutados; ver tabla de arriba. Fallo de **infraestructura** (no de código)

### Intento 3 — 2026-10-03
- Job / stage: `quality` (con el cache de Playwright restaurado desde el job `e2e` previo)
- Error observado: `eslint` analizó `.cache/ms-playwright/.../main.js` → 1 error `no-this-alias`
- Hipótesis: fallo **de código/config** (ESLint no ignoraba directorios de caché del CI)
- Cambio aplicado: `.cache/**` y `.pnpm-store/**` en `globalIgnores` (y en `.gitignore`/`.prettierignore`)
- Resultado: ver siguiente intento
