# Informe de calidad: cobertura de tests y justificación cuantitativa de decisiones

> Todas las cifras de este documento se midieron sobre el código de `main` (2026-10-03).
> Las de la sección 4 se regeneran con `pnpm bench` (semilla fija; usa una base temporal `bonds_bench_*` que elimina al terminar). Las de cobertura, con `pnpm test:cov`.

## 1. Resumen

| Indicador                                                                        | Valor                                                                                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tests automáticos                                                                | **73** unitarios/integración (Vitest) + **37** E2E declarados (32 en CI: Chromium + móvil; 5 de smoke de producción) |
| Cobertura de `lib/domain` + `lib/money` + `lib/bps` (umbral del proyecto ≥ 90 %) | **100 %** líneas · 97,1 % sentencias · 98,6 % funciones · 87,3 % ramas                                               |
| Cobertura de todo `lib/` (dominio + servicios + repositorios + auth + storage)   | **82,6 %** líneas · 80,3 % sentencias · 77,4 % funciones · 66,0 % ramas                                              |
| Código de producción / de pruebas                                                | 8 504 / 2 134 líneas (≈ 1 línea de test por cada 4 de producción)                                                    |
| Pipeline GitLab (`quality → test → build → e2e`)                                 | verde, sin `allow_failure`; ≈ 1 m 40 s · 1 m 35 s · 1 m 50 s · 2 m 54 s                                              |
| E2E completo                                                                     | 23 s en local · 1,1 min en el runner de CI (32 tests)                                                                |

## 2. Cobertura de tests

### 2.1 Pirámide

| Nivel                                 | Tests | Qué demuestra                                                                                     | Dónde                                                                                                       |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unitario                              | 51    | Aritmética, calendario, YTM, bookbuilding, valoración, alertas, validación de entorno             | `tests/unit` (money 10 · schedule 14 · bookbuilding/valoración/alertas 13 · ytm 8 · env 6)                  |
| Integración (Mongo real, replica set) | 22    | Adjudicación transaccional, jobs idempotentes, alertas, tablero, screener, documentos, magic link | `tests/integration` (auth 7 · payments 4 · alerts 3 · bookbuilding 3 · screener+documentos 3 · portfolio 2) |
| E2E (Playwright)                      | 37    | Los 9 flujos de negocio de `PROMPT.md` sobre la app real                                          | `e2e/`                                                                                                      |

Cobertura de los 9 flujos E2E exigidos:

| #   | Flujo                                                                   | Archivo                     |
| --- | ----------------------------------------------------------------------- | --------------------------- |
| 1   | Login admin/investor, token reutilizado falla, logout                   | `auth.spec.ts` (6)          |
| 2   | Emisor + emisión, calendario, abrir bookbuilding                        | `issuance.spec.ts`          |
| 3   | Dos inversores ordenan; el libro del admin se actualiza solo            | `issuance.spec.ts`          |
| 4   | Cierre, precio, adjudicación con prorrateo (54/46), posiciones y correo | `issuance.spec.ts`          |
| 5   | `jobs` con fecha simulada → pago visible; segunda ejecución = 0         | `payments.spec.ts`          |
| 6   | Screener (rating, YTM, vencimiento, sector, combinados) y compra        | `screener.spec.ts` (7)      |
| 7   | Cambio de rating → alerta in-app + email solo a afectados               | `alerts.spec.ts` (2)        |
| 8   | Subida/descarga de documento; 403 sin posición                          | `documents.spec.ts` (2)     |
| 9   | Autorización negativa (`/admin`, `/api/admin/*`, cron, cabeceras)       | `authorization.spec.ts` (7) |
| —   | Viewport móvil sin desbordes                                            | `mobile.spec.ts` (2)        |

### 2.2 Cobertura por módulo (`lib/`, tests unitarios + integración, sin E2E)

| Módulo                                                             | Líneas | Ramas   | Lectura                                                                                                                             |
| ------------------------------------------------------------------ | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `lib/money.ts`, `lib/bps.ts`                                       | 100 %  | 92–97 % | Núcleo de dinero totalmente cubierto                                                                                                |
| `lib/domain/*`                                                     | 100 %  | 84,3 %  | Núcleo financiero; ramas sin cubrir son guardas defensivas (p. ej. bisección de respaldo de YTM)                                    |
| `lib/jobs/payments.ts`                                             | 100 %  | 83,3 %  | Idempotencia y vencimiento probados                                                                                                 |
| `lib/services/*`                                                   | 89,3 % | 68,3 %  | `admin.ts` (agregados de pantalla) está en 0 %: solo lo ejercita el E2E                                                             |
| `lib/validation`                                                   | 91,4 % | 80 %    |                                                                                                                                     |
| `lib/auth`                                                         | 62,3 % | 53,8 %  | `jwt.ts` 100 %; `guards.ts`/`session.ts` están en 0 % en Vitest porque dependen de `next/headers`: los cubre el E2E de autorización |
| `lib/repositories`                                                 | 67,3 % | 47,4 %  | Parte se ejerce vía servicios; `alerts.ts` (1 función) y consultas de listado solo vía E2E                                          |
| `lib/storage`                                                      | 40,4 % | 18,8 %  | Los tests usan el driver `fs`; la rama S3/R2 solo se ejerce en el E2E local con RustFS                                              |
| `lib/mailer`                                                       | 25 %   | 9,1 %   | Se prueba el driver `memory`; SMTP y Resend se ejercen en E2E local (MailHog) y en producción                                       |
| `lib/http.ts`, `lib/cron.ts`, `lib/format.ts`, `lib/client-api.ts` | 0–44 % | —       | Se cubren por E2E (códigos 400/401/403/404, cron con Bearer)                                                                        |

**Lectura honesta:** el 100 % del dominio es real; el 82,6 % de `lib/` es una cota inferior, porque los puntos en 0 % (guards, cron, http) sí se recorren en los 7 tests de autorización E2E, pero Vitest no los ve. Las zonas más débiles son los adaptadores de infraestructura (storage S3 y mailer SMTP/Resend), que solo se prueban contra servicios reales, no con tests unitarios aislados. No hay tests de componentes React: la UI (13 componentes cliente) se valida por E2E.

## 3. Umbrales y automatización

- `vitest.config.mts` exige ≥ 90 % de líneas/sentencias/funciones y ≥ 80 % de ramas en dominio y dinero; el job `test` falla si se baja. Resultado actual: 100 / 97,1 / 98,6 / 87,3 %.
- El CI publica JUnit y el informe Cobertura en el MR (`coverage_report`).
- `pnpm verify` (lint + typecheck + test + E2E con Docker) es el requisito previo a cada empuje al espejo.

## 4. Justificación cuantitativa de las decisiones técnicas

Metodología: PRNG determinista (mulberry32), muestras de 10⁶ (aritmética), 2·10⁴ (YTM, adjudicación) y 3·10⁵ documentos (índices) en MongoDB 7 local. Script: `scripts/bench-decisions.ts`.

### 4.1 Dinero en céntimos enteros y una única función de redondeo (`mulDiv`, BigInt, half-even)

| Medición                                                                                                             | Resultado                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Aritmética binaria ordinaria                                                                                         | `0.1 + 0.2 === 0.3` → `false`; `1.005 × 100` → `100.49999999999999`                                                                         |
| Acumular 10⁶ pagos de 0,10 con flotantes                                                                             | error de 0,000133 centavos: la deriva por acumulación es pequeña; **el problema real es la comparación exacta y el redondeo**, no la deriva |
| `Math.round(a·b/c)` frente a `mulDiv`, rango realista (≤ 10 k títulos, nominal ≤ $10 000; el producto no excede 2⁵³) | **0,136 %** de resultados distintos (1 361 de 10⁶), todos por empates `.5` redondeados hacia arriba                                         |
| Mismo cálculo, rango institucional (≤ 1 M títulos, nominal ≤ $1 M)                                                   | **0,391 %** distintos (3 908 de 10⁶); en el 94,6 % de las muestras el producto supera 2⁵³ (9,007·10¹⁵) y el flotante pierde precisión       |
| Error máximo observado                                                                                               | 1 centavo por operación                                                                                                                     |
| Sesgo de redondeo en 10⁶ empates `.5`                                                                                | half-up: **+500 000 centavos ($5 000)** acumulados; half-even (`mulDiv`): **−675 centavos ($6,75)**                                         |

Conclusión: 1 centavo por operación parece poco, pero el sesgo half-up es sistemático (+0,5 centavos por empate) y se acumula en pagos de cupón a miles de inversores; half-even lo reduce ≈ 740 veces. BigInt cuesta microsegundos y evita el desbordamiento de 2⁵³. Un único punto de redondeo permite probarlo (10 tests) y auditarlo.

### 4.2 YTM con Newton-Raphson + bisección de respaldo

| Medición (2·10⁴ bonos aleatorios: frecuencia 1–12, 1–15 años, cupón 2–18 %, precio 50–130 %) | Resultado                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------ |
| Convergencia                                                                                 | **20 000 / 20 000** (0 sin solución) |
| Error de ida y vuelta precio → YTM → precio (bps de precio)                                  | p50 = 1 · p99 = 5 · máx = 8          |
| Latencia media por resolución                                                                | **38,7 µs** (1,4 s para las 20 000)  |

Conclusión: el YTM se guarda como entero en bps, así que el error de ida y vuelta de ≤ 1 bp en la mediana es el límite de la resolución; 38,7 µs permite recalcularlo en cada actualización de precio y en el screener sin caché. El máximo de 8 bps es el peor caso observado en la muestra; no se analizó su causa.

### 4.3 Adjudicación con prorrateo hacia abajo + residuo por orden de llegada

| Medición (2·10⁴ libros aleatorios, 1–40 órdenes)              | Resultado    |
| ------------------------------------------------------------- | ------------ |
| Violaciones de `Σ adjudicado = min(oferta, demanda elegible)` | **0**        |
| Órdenes con más títulos adjudicados de los pedidos            | **0**        |
| Desviación máxima respecto del prorrateo ideal (fraccional)   | **1 título** |
| Tiempo para 10 000 órdenes                                    | **2,2 ms**   |

Conclusión: el reparto es exacto en títulos enteros y nunca se aleja más de 1 título del ideal, por eso se eligió la regla de residuo en vez de redondear al más cercano (que puede sobre- o infra-adjudicar).

### 4.4 Pagos persistidos e índices (`scheduledPayments`, 300 000 documentos)

| Consulta (primeros 100)                        | Sin índice                       | Con índice          | Mejora                                     |
| ---------------------------------------------- | -------------------------------- | ------------------- | ------------------------------------------ |
| Job: `{status, dueDate ≤ hoy}`                 | 300 000 docs examinados · 103 ms | 100 docs · **1 ms** | 3 000× menos documentos, ≈ 100× más rápido |
| Tablero: `{investorId, status, dueDate ≥ hoy}` | 300 000 docs · 83 ms             | 100 docs · **1 ms** | 3 000× menos documentos, ≈ 80× más rápido  |

Los pagos se persisten (no se calculan al vuelo), así que el tablero y el job son lecturas indexadas de coste constante en vez de recalcular el calendario de cada bono para cada inversor.

### 4.5 Jobs idempotentes con actualización atómica condicionada

Dos procesos concurrentes procesando los mismos 18 530 pagos vencidos:

| Estrategia                                                                | Pagos "cobrados" contabilizados                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Leer estado y luego escribir                                              | **36 965** (≈ 2×: casi todos los pagos se cobran dos veces) |
| `updateOne({_id, status:'scheduled'}, {$set:{status:'paid'}})` (la usada) | **18 530** (exacto)                                         |

Esto justifica que Vercel Cron pueda reintentar o solaparse sin duplicar cobros ni alertas (las alertas se deduplican además con índice único `(investorId, dedupeKey)`).

### 4.6 Adjudicación en transacción

Coste medido de `closeAndAllocate` (órdenes + posiciones + pagos + bono, todo en una transacción):

| Órdenes en el libro | Pagos persistidos | Duración |
| ------------------- | ----------------- | -------- |
| 10                  | 44                | 36 ms    |
| 100                 | 594               | 150 ms   |
| 500                 | 3 278             | 783 ms   |

Con atomicidad probada: un fallo a mitad deja el bono en `bookbuilding`, 0 posiciones y las órdenes en `pending` (test `bookbuilding.test.ts`). Crecimiento aproximadamente lineal (≈ 1,5 ms por orden). **Límite conocido:** la actualización de órdenes se hace una a una dentro de la transacción; un `bulkWrite` reduciría la duración, pero 0,8 s para 500 órdenes está muy por debajo del límite de transacción de Mongo (60 s) y de los 10 s de una función Vercel, así que se priorizó la claridad.

### 4.7 Libro en vivo por polling cada 3 s (en vez de SSE)

| Órdenes pendientes | Tamaño de respuesta | Tráfico por administrador (20 peticiones/min) |
| ------------------ | ------------------- | --------------------------------------------- |
| 10                 | 2,2 KB              | 45 KB/min                                     |
| 100                | 14,4 KB             | 288 KB/min                                    |
| 500                | 68,7 KB             | 1,4 MB/min                                    |

Funciona sobre funciones serverless sin conexiones persistentes. El coste crece con el libro; si un libro superara ≈ 500 órdenes convendría paginar la tabla de órdenes (la demanda agregada pesa unos cientos de bytes) o pasar a SSE. En E2E el libro reflejó dos órdenes nuevas en < 12 s sin recargar.

### 4.8 Otras decisiones medibles

| Decisión                                                             | Evidencia                                                                                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16 + Server Components por defecto                           | 13 de 42 archivos `.tsx` son `'use client'`; JS de cliente total 708 KB en disco / **200 KB gzip** repartidos en 19 chunks; 53 rutas, 7,7 s de `next build` en local y 1 m 50 s en el runner |
| Aislamiento de E2E (base `bonds_e2e`, `distDir` aparte, puerto 3100) | 3 ejecuciones consecutivas en verde sin tocar la base de desarrollo; mismo resultado en Docker y en modo memoria                                                                             |
| E2E sin contenedores en CI                                           | 32 tests en 1,1 min en el runner sin Docker (Mongo en memoria + correo `memory` + storage `fs`)                                                                                              |
| Mongo 7 (no 8) en Docker                                             | `mongo:8` no arranca en el kernel Linux ≥ 6.19 de Docker Desktop (SERVER-121912); 7 coincide con Atlas                                                                                       |
| Magic link de un solo uso con consumo atómico                        | Test: el segundo uso devuelve `used`; token manipulado → `invalid`; expirado → `expired`; 4.º intento en 15 min → 429                                                                        |

## 5. Riesgos y trabajo futuro (por impacto)

1. **Adaptadores sin test unitario:** `lib/storage` (40 %) y `lib/mailer` (25 %) solo se ejercen contra servicios reales. Añadir tests con `aws-sdk-client-mock` y un transporte SMTP falso subiría `lib/` a ≈ 88 %.
2. **Cobertura de ramas de `lib/` (66 %):** las ramas de error de servicios (p. ej. rechazos de `trading` y `documents`) se cubren de forma parcial.
3. **Transacción de adjudicación:** pasar a `bulkWrite` para libros > 500 órdenes (hoy 0,8 s para 500).
4. **Polling del libro:** paginar las órdenes por encima de ≈ 500 (hoy 69 KB por petición).
5. **Seed de producción (Atlas):** el perfil demo se validó en local (idempotencia: 0 creados en la segunda ejecución); en Atlas se ejecutó una vez, la segunda ejecución no se ha repetido.

## 6. Cómo reproducir

```bash
pnpm test:cov                                   # cobertura de dominio y dinero (con umbrales)
pnpm exec vitest run --coverage --coverage.include='lib/**' --coverage.thresholds.lines=0 \
  --coverage.thresholds.functions=0 --coverage.thresholds.statements=0 --coverage.thresholds.branches=0   # todo lib/
pnpm services:up && pnpm bench                  # sección 4 (necesita Mongo con replica set)
pnpm verify                                     # lint + typecheck + tests + E2E
```
