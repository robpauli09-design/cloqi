import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { currentUser } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { Mascot } from '@/components/Mascot';
import { AuthForm } from './AuthForm';

export const metadata: Metadata = { title: 'Anmelden' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser();
  if (user) redirect(user.onboarded ? '/dashboard' : '/onboarding');
  const { deleted } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-leaf-deep px-12 py-12 text-paper lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-leaf/25 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-lime/15 blur-3xl" />
        <Logo light />
        <div className="relative mt-auto flex items-end gap-8">
          <div className="max-w-md pb-10">
            <p className="eyebrow !text-lime">Your day. Your flow.</p>
            <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.05]">Dein Tag.<br />Dein Flow.</h1>
            <p className="mt-5 text-lg text-paper/75">Dein Kalender denkt mit. Du konzentrierst dich auf das, was wirklich zählt.</p>
            <ul className="mt-8 space-y-2 text-sm text-paper/80">
              <li>✓ Stundenplan, Termine & Kalender an einem Ort</li>
              <li>✓ Lernpläne, die sich selbst um dein Leben herum planen</li>
              <li>✓ Daten in der EU, verschlüsselte Verbindungen</li>
            </ul>
          </div>
          <Mascot variant="full" size={230} float priority className="relative -mb-12 shrink-0" />
        </div>
      </section>

      <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="mb-6 flex flex-col items-center gap-3 lg:hidden">
          <Mascot variant="bust" size={130} priority />
          <Logo />
        </div>
        <div className="w-full max-w-sm">
          <h2 className="h1 lg:text-4xl">Willkommen bei CLOQI</h2>
          <p className="muted mt-2">Dein Kalender denkt mit. Du konzentrierst dich auf das, was wirklich zählt.</p>
          {deleted && <p className="mt-4 rounded-xl bg-leaf-soft px-3 py-2 text-sm text-leaf-dark">Dein Account und alle Daten wurden gelöscht.</p>}
          <AuthForm />
        </div>
      </section>
    </main>
  );
}
