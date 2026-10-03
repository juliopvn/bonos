import { AppShell } from '@/components/AppShell';
import { GlobalProvider } from '@/context/GlobalContext';
import { loadShellData } from '@/lib/auth/layout-data';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user, unread } = await loadShellData('investor');
  return (
    <GlobalProvider user={user} initialUnread={unread}>
      <AppShell role="investor" email={user.email}>
        {children}
      </AppShell>
    </GlobalProvider>
  );
}
