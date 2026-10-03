# Decisiones (ADR cortos)

Formato: **Contexto → Decisión → Consecuencia.** Se registran las decisiones que `PROMPT.md` no fijaba.

## Dominio

### D1 · Plazo desde emisión hasta vencimiento

`term` se deriva de **emisión → vencimiento** (corto ≤ 12 meses, medio ≤ 60, largo > 60), no del tiempo restante, para que sea estable y filtrable. No es editable.

### D2 · Aritmética entera con `mulDiv` (BigInt interno)

`mulDiv(a, b, c)` redondea half-even con BigInt para evitar pérdida de precisión en productos grandes (`títulos × nominal × precio`). Es el único punto de redondeo del dominio. `YTM` es el único cálculo con coma flotante (Newton-Raphson) y su resultado se redondea a bps enteros con `roundHalfEven`.

### D3 · Cupones: periodo regular = 1/frecuencia

Con 30/360, un periodo regular paga exactamente `nominal × tasa / frecuencia` (evita artefactos de fin de mes); el primer periodo irregular usa `days360 / 360`. ACT/360 y ACT/365 usan días reales siempre. Las fechas se generan hacia atrás desde el vencimiento y respetan fin de mes si el vencimiento lo es.

### D4 · Precio "sucio" sin intereses devengados

El precio de mercado y el de compra se tratan como precio total (sin separar cupón corrido). Simplifica compra secundaria, valoración y YTM. En la compra secundaria solo se programan los flujos posteriores a la fecha de compra.

### D5 · YTM compuesto con la frecuencia del bono, tiempos 30/360

`price = Σ flujo / (1 + y/f)^(f·t)`. Si Newton no converge se usa bisección; rendimientos < −50 % se consideran inalcanzables (`null`). A la par, YTM = cupón.

### D6 · Adjudicación a precio único

Se adjudican las órdenes con límite ≥ precio final, todas al precio final. Prorrateo con redondeo hacia abajo y residuo de a un título por orden de llegada (sin exceder lo solicitado). Si hay infrasuscripción, lo no colocado queda como **inventario del mercado secundario** (`availableUnits`). El bono pasa a `active` si la fecha de emisión ya llegó; si no, a `allocated` y el job de pagos lo activa en su fecha.

### D7 · Pagos persistidos y acumulables

Un documento por (bono, inversor, tipo, fecha) con índice único. Las compras secundarias adicionales acumulan con `$inc`; así recalcular cupones variables es directo. Al actualizar la tasa de referencia solo se recalculan los `scheduled` (no los pagados).

### D8 · Alertas

- **Precio**: variación = |Δ| en bps de precio entre las dos últimas cotizaciones; umbral por usuario (default 200).
- **Rating**: ventana de 7 días sobre `ratingHistory`; se dispara también al cambiarlo (evento) y el job es una red de seguridad. Clave: `rating:emisor:nuevo:fecha`.
- **Rebalanceo**: exige ≥ 2 posiciones; una alerta por dimensión/clave/día.
- Todas con índice único `(investorId, dedupeKey)`; el email respeta `alertPrefs.email` y un fallo de correo no rompe el flujo.

### D9 · Vencimiento cierra posiciones

Al pagar el principal el bono pasa a `matured`, `availableUnits = 0` y las posiciones quedan con `units = 0` (se conserva el historial).

## Plataforma

### D10 · Auth

Los correos desconocidos se crean como `investor` al verificar (o `admin` si están en `ADMIN_EMAILS`). El enlace apunta directo a `/api/auth/verify`; los errores redirigen a `/verify?error=`. Rate limit en Mongo (ventana fija de 15 min) para funcionar en serverless. La cookie es `secure` cuando `APP_URL` es https.

### D11 · Roles en `proxy.ts` y en servidor

`proxy.ts` redirige (no autenticado → `/login`; investor en `/admin` → `/investor`; admin en `/investor` → `/admin`). Cada ruta/servicio vuelve a validar. Las APIs de admin viven bajo `/api/admin/*`.

### D12 · Storage: subida por servidor

El admin sube por `multipart` a la API (validación de tipo, extensión y 5 MB); no hay subida directa desde el navegador, así que R2 no necesita CORS. Descarga: autorización en servidor + redirección 302 a URL prefirmada (`s3`) o firmada por la app (`fs`). El bucket se crea solo (contenedor `rustfs-init` y `ensureBucket`).

### D13 · Libro en vivo por polling (3 s)

Más simple que SSE y compatible con serverless. La vista admin simula la adjudicación en el cliente con la **misma función de dominio** que usa el servidor.

### D14 · Reporte por emisión en CSV

CSV UTF-8 con BOM (resumen, adjudicación, calendario de pagos, covenants), guardado como documento `report`. PDF no era requisito.

### D15 · Jobs y fecha simulada

`/api/cron/*` acepta GET (Vercel Cron) y POST, protegido con `Authorization: Bearer CRON_SECRET` (comparación en tiempo constante). `?date=` solo fuera de producción o con `E2E_MODE`.

### D16 · Seeds

`faker` con semilla fija; fechas relativas a "hoy" para que haya cupones próximos y pasados. Idempotente por claves naturales (email, nombre, código). `seed:reset` vacía todas las colecciones y se rechaza con el perfil `demo`.

## Herramientas y entorno

### D17 · MongoDB 7 en Docker

`mongo:8` no arranca en Docker Desktop con kernel Linux ≥ 6.19 (SERVER-121912). Se usa `mongo:7` (coincide con Atlas). El puerto del host es configurable con `MONGO_PORT` por si el 27017 está ocupado.

### D18 · TypeScript 5 y ESLint 9

`typescript-eslint` aún no soporta TS 7 y `eslint-plugin-react` falla con ESLint 10, así que se fijan TS 5 y ESLint 9 (los que usa `eslint-config-next`).

### D19 · `docker compose up --wait` + init del bucket

`rustfs-init` termina con código 0 y `--wait` lo trata como error; `services:up` levanta los servicios sanos y ejecuta `rustfs-init` aparte.

### D20 · E2E aislado y estable

Base propia `bonds_e2e`, `distDir` `.next-e2e` y puerto 3100 (no interfiere con `pnpm dev`); un worker; el proyecto móvil ejecuta solo `mobile.spec.ts`. Cada archivo crea sus datos (`ISS-*`) o restaura lo que cambia, de modo que no dependen del orden.

### D21 · Diseño

Dirección "título valor": papel verdoso `#e9ede7`, tinta `#0d2b2c`, verdigris `#1d5c58`, dorado `#a97a27` y bermellón para negativos. Tipografía: Gloock (display), Hanken Grotesk (texto), IBM Plex Mono (cifras tabulares). Firma: **cupón desprendible** (talón perforado) para los flujos de pago y orla guilloché en cabeceras. Sin modo oscuro (fuera de alcance).
