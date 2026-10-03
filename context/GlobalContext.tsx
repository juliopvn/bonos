'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'investor';
}

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface GlobalState {
  user: CurrentUser;
  unreadAlerts: number;
  refreshAlerts: () => Promise<void>;
  setUnreadAlerts: (n: number) => void;
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<GlobalState | null>(null);

export function GlobalProvider({
  user,
  initialUnread,
  children,
}: {
  user: CurrentUser;
  initialUnread: number;
  children: React.ReactNode;
}) {
  const [unreadAlerts, setUnreadAlerts] = useState(initialUnread);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (res.ok) setUnreadAlerts((await res.json()).unreadAlerts ?? 0);
    } catch {
      /* sin red: se conserva el último valor */
    }
  }, []);

  useEffect(() => {
    if (user.role !== 'investor') return;
    const t = setInterval(refreshAlerts, 30_000);
    return () => clearInterval(t);
  }, [user.role, refreshAlerts]);

  const value = useMemo(
    () => ({ user, unreadAlerts, refreshAlerts, setUnreadAlerts, toast }),
    [user, unreadAlerts, refreshAlerts, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2"
        data-testid="toasts"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            data-testid={`toast-${t.kind}`}
            className="rise card px-4 py-3 text-sm shadow-lg"
            style={{
              borderLeft: `4px solid ${
                t.kind === 'error' ? 'var(--color-vermilion)' : t.kind === 'info' ? 'var(--color-verdigris)' : 'var(--color-moss)'
              }`,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useGlobal(): GlobalState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGlobal debe usarse dentro de <GlobalProvider>');
  return v;
}
