import type { Metadata } from 'next';
import { Guilloche } from '@/components/Guilloche';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Acceso' };

export default function LoginPage() {
  const showDemo = process.env.NODE_ENV !== 'production';
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.25fr_1fr] lg:px-8">
      <section className="rise" aria-labelledby="hero-title">
        <p className="eyebrow mb-4">Mercado primario y secundario de deuda corporativa</p>
        <h1 id="hero-title" className="display text-[clamp(2.6rem,6vw,4.6rem)]">
          Cada cupón,
          <br />
          en su fecha.
        </h1>
        <p className="muted mt-5 max-w-md text-lg">
          Estructura emisiones, abre el libro de órdenes y cobra el principal al vencimiento. O
          compra bonos, y mira tu cartera trabajar.
        </p>

        <figure className="certificate rise-2 mt-10 max-w-xl p-8" aria-label="Ejemplo de título">
          <Guilloche size={420} className="pointer-events-none absolute -top-24 -right-24" />
          <figcaption className="eyebrow relative">Ejemplo de título · Serie 2031-A</figcaption>
          <p className="display relative mt-3 text-3xl">Bono Corporativo Aurora Energía</p>
          <dl className="relative mt-6 grid grid-cols-3 gap-4 border-t-[3px] border-double border-gilt pt-4 text-sm">
            <div>
              <dt className="label">Nominal</dt>
              <dd className="num text-base font-medium">$1,000.00</dd>
            </div>
            <div>
              <dt className="label">Cupón</dt>
              <dd className="num text-base font-medium">8.25% sem.</dd>
            </div>
            <div>
              <dt className="label">Vence</dt>
              <dd className="num text-base font-medium">15/05/2031</dd>
            </div>
          </dl>
        </figure>
      </section>

      <section className="rise-3" aria-labelledby="login-title">
        <div className="coupon">
          <div className="p-7">
            <p className="eyebrow">Cupón de acceso</p>
            <h2 id="login-title" className="display mt-1 text-3xl">
              Entra con tu correo
            </h2>
            <p className="muted mt-2 text-sm">
              Te enviamos un enlace de un solo uso. Sin contraseña.
            </p>
            <LoginForm />
            {showDemo && (
              <p className="hint mt-6 border-t border-dashed border-line pt-4">
                Demo local: <span className="num">admin@demo.local</span> ·{' '}
                <span className="num">investor1@demo.local</span>. Los correos llegan a{' '}
                <a
                  className="underline"
                  href="http://localhost:8025"
                  target="_blank"
                  rel="noreferrer"
                >
                  MailHog
                </a>
                .
              </p>
            )}
          </div>
          <div className="stub hidden items-center sm:flex" aria-hidden="true">
            <span className="display text-5xl text-gilt" style={{ writingMode: 'vertical-rl' }}>
              Bonos
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
