# 💰 Gestión de Bonos Corporativos — Next.js + MongoDB

## 🎯 Objetivo del proyecto

Construir una aplicación **fintech de deuda corporativa**: el administrador estructura emisiones de bonos y gestiona el libro de órdenes; el inversor busca bonos, compra y sigue su cartera.

Con este proyecto el alumno aprende:

- A modelar un **dominio financiero complejo**: nominal, cupón fijo/variable, frecuencia de pago, vencimiento, YTM, rating.
- El proceso de **bookbuilding** (libro de órdenes durante el periodo de oferta).
- A calcular y programar **flujos de pago** (cupones periódicos + devolución del principal).
- Filtros y agregaciones avanzadas en MongoDB para el screener y el dashboard.

## 🏗️ Arquitectura

```
┌──────────────┐        ┌───────────────────┐        ┌──────────┐
│  Next.js     │ ─────► │   API Routes      │ ─────► │ MongoDB  │
│ admin /      │        │  emisiones,       │        └──────────┘
│ investor     │        │  órdenes, cartera,│        ┌──────────┐
└──────────────┘        │  alertas, reports │ ─────► │ MailHog  │ (magic link,
                        └───────────────────┘        └──────────┘  alertas)
```

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16 + TypeScript + Tailwind, `GlobalContext`, `proxy.ts` |
| Base de datos | MongoDB driver nativo (singleton `lib/db.ts`), importes en céntimos |
| Auth | Magic link (JWT `jose`) vía MailHog |
| Storage | S3/RustFS para documentos (reportes, fiscales) |

## ⚙️ Funcionalidades

**Admin**
- **Estructuración de la emisión**: valor nominal, tasa de cupón (fija o variable), frecuencia de pagos, vencimiento, empresa emisora y nombre; plazos corto/medio/largo.
- **Libro de órdenes (bookbuilding)**: seguimiento de la demanda de los inversores durante la oferta para ajustar el precio final.
- **Automatización de pagos**: programación de cupones y devolución del principal al vencimiento.
- **Cumplimiento y reportes**: documentos fiscales, uso de fondos y covenants.

**Investor**
- **Screener de bonos**: filtros por rating crediticio, rendimiento (YTM), vencimiento y sector; compra de bonos.
- **Tablero de posición**: valor de mercado de la cartera, próximos cupones a cobrar y rendimiento histórico.
- **Alertas**: cambios de rating del emisor, fluctuaciones de precio, rebalanceo.

## 💡 Solución

1. **El bono es la entidad central** y sus pagos se derivan de él: a partir de cupón + frecuencia + vencimiento se genera el calendario de flujos de cada inversor. Guardar los pagos programados (en vez de calcularlos al vuelo) simplifica el tablero y las alertas.
2. **Bookbuilding como colección de órdenes**: durante la oferta las órdenes se acumulan con su precio/cantidad; el admin ve la demanda agregada en tiempo real y fija el precio final antes de adjudicar.
3. **Importes en céntimos y tipos en puntos básicos** — los enteros evitan los errores de redondeo que en finanzas son inaceptables.
4. **Roles**: las rutas de administración comprueban el rol del JWT en servidor; el inversor solo ve sus posiciones y órdenes.
5. El **seed** genera emisores, bonos con distintos ratings/plazos y carteras de ejemplo para explorar el screener desde el primer momento.

## 🚀 Cómo ejecutar

1. Arranca MongoDB local, MailHog y RustFS en Docker.
2. Crea `.env.local` con `MONGODB_URI`, MailHog (`localhost:1025`) y la config de RustFS (`http://localhost:9001`).
3. Instala, siembra y arranca:

```bash
npm install
npx tsx scripts/seed.ts
npm run dev
```

4. Magic links visibles en [http://localhost:8025](http://localhost:8025).
