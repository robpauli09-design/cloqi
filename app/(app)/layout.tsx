import { requireReadyUser } from '@/lib/auth';
import { cycleAvailable } from '@/lib/types';
import { cookies } from 'next/headers';
import { AppFrame, MobileNav, MobileSectionTabs } from '@/components/Navigation';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { Toaster } from '@/components/Toaster';
import { BackgroundTasks } from '@/components/BackgroundTasks';
import { RememberPath } from '@/components/RememberPath';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const nav = { name: user.name || user.email, email: user.email, mascot: user.prefs.mascot, cycle: cycleAvailable(user), tabs: user.prefs.navTabs };
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === '1';
  return (
    <AppFrame nav={nav} collapsed={collapsed}>
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-32 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8"><MobileSectionTabs tabs={nav.tabs} />{children}</main>
      <MobileNav mascot={nav.mascot} />
      <Toaster mascot={user.prefs.mascot} />
      <BackgroundTasks mascot={user.prefs.mascot} />
      <RememberPath />
    </AppFrame>
  );
}
