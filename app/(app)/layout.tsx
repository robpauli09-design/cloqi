import { requireReadyUser } from '@/lib/auth';
import { Sidebar, MobileNav } from '@/components/Navigation';
import { Toaster } from '@/components/Toaster';
import { BackgroundTasks } from '@/components/BackgroundTasks';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const nav = { name: user.name || user.email, email: user.email, mascot: user.prefs.mascot, cycle: user.prefs.cycleEnabled };
  return (
    <div className="min-h-screen lg:pl-[248px]">
      <Sidebar {...nav} />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      <MobileNav cycle={nav.cycle} />
      <Toaster mascot={user.prefs.mascot} />
      <BackgroundTasks mascot={user.prefs.mascot} />
    </div>
  );
}
