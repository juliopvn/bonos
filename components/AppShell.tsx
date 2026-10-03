import { NavLinks, LogoutButton } from './NavLinks';

export interface NavItem {
  href: string;
  label: string;
  badge?: 'alerts';
  exact?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Resumen', exact: true },
  { href: '/admin/issuers', label: 'Emisores' },
  { href: '/admin/bonds', label: 'Emisiones' },
  { href: '/admin/bookbuilding', label: 'Bookbuilding' },
  { href: '/admin/payments', label: 'Pagos' },
  { href: '/admin/compliance', label: 'Cumplimiento' },
];

const INVESTOR_NAV: NavItem[] = [
  { href: '/investor', label: 'Mi cartera', exact: true },
  { href: '/investor/screener', label: 'Screener' },
  { href: '/investor/orders', label: 'Órdenes' },
  { href: '/investor/documents', label: 'Documentos' },
  { href: '/investor/alerts', label: 'Alertas', badge: 'alerts' },
];

export function AppShell({
  role,
  email,
  children,
}: {
  role: 'admin' | 'investor';
  email: string;
  children: React.ReactNode;
}) {
  const items = role === 'admin' ? ADMIN_NAV : INVESTOR_NAV;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-gilt focus:px-3 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>
      <aside className="bg-verdigris-deep text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:py-7">
          <div>
            <p className="display text-3xl leading-none">Bonos</p>
            <p className="mt-1 text-[11px] tracking-[0.16em] text-gilt-soft uppercase">
              {role === 'admin' ? 'Mesa de emisión' : 'Mesa de inversión'}
            </p>
          </div>
          <div className="lg:hidden">
            <LogoutButton />
          </div>
        </div>
        <nav
          aria-label="Principal"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:pb-0"
        >
          <NavLinks items={items} />
        </nav>
        <div className="absolute inset-x-0 bottom-0 hidden border-t border-white/10 p-5 lg:block">
          <p className="truncate text-xs text-white/60" data-testid="user-email">
            {email}
          </p>
          <div className="mt-2">
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-10 lg:py-9" id="contenido">
        {children}
      </main>
    </div>
  );
}
