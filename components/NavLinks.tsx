'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useGlobal } from '@/context/GlobalContext';
import { api } from '@/lib/client-api';
import type { NavItem } from './AppShell';

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { unreadAlerts } = useGlobal();
  return (
    <>
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            className="nav-link"
            aria-current={active ? 'page' : undefined}
            data-testid={`nav-${it.href.split('/').pop() || 'home'}`}
          >
            {it.label}
            {it.badge === 'alerts' && unreadAlerts > 0 && (
              <span
                className="num ml-auto rounded-sm bg-gilt px-1.5 text-xs font-semibold text-white"
                data-testid="alerts-badge"
                aria-label={`${unreadAlerts} alertas sin leer`}
              >
                {unreadAlerts}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-sm border-white/30 text-white hover:bg-white/10"
      data-testid="logout"
      onClick={async () => {
        await api('/api/auth/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}
