import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { feedUrls } from '@/lib/feed';
import { isConfigured } from '@/lib/integrations';
import { getConnection, listBreaks, listTimetable } from '@/lib/repo';
import { Mascot } from '@/components/Mascot';
import { schoolStats } from '@/lib/school';
import { AppleCard, ImportCard, ManualTimetable, ProviderCard, SchoolCard, WebUntisCard } from './ConnectCards';

export const metadata: Metadata = { title: 'Kalender verbinden' };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireReadyUser();
  const { ok, error } = await searchParams;
  const conns = Object.fromEntries(await Promise.all((['google', 'outlook', 'webuntis', 'apple', 'school'] as const).map(async p => {
    const c = await getConnection(user.id, p);
    return [p, c ? { status: c.status, lastSyncAt: c.lastSyncAt, lastError: c.lastError, config: c.config } : null] as const;
  })));
  const conn = (p: 'google' | 'outlook' | 'webuntis' | 'apple' | 'school') => conns[p];
  return (
    <div className="space-y-6">
      <header className="flex items-end gap-4">
        <div className="flex-1">
          <p className="eyebrow">Kalender verbinden</p>
          <h1 className="h1">Alle Kalender. Ein Ort.</h1>
          <p className="muted mt-1 max-w-2xl">
            Verbinde deine Kalender einmal – CLOQI führt alles zusammen. Du entscheidest pro Dienst, was importiert und was übertragen wird,
            und kannst jede Verbindung jederzeit trennen.
          </p>
        </div>
        <Mascot name={user.prefs.mascot} variant="bust" size={100} className="hidden sm:block" />
      </header>
      {ok && <p className="rounded-xl bg-leaf-soft px-4 py-3 text-sm font-medium text-leaf-dark">{ok}</p>}
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <ProviderCard provider="google" configured={isConfigured('google')} conn={conn('google')} tz={user.timezone} />
        <ProviderCard provider="outlook" configured={isConfigured('outlook')} conn={conn('outlook')} tz={user.timezone} />
        <AppleCard conn={conn('apple')} urls={await feedUrls(user)} tz={user.timezone} />
        <WebUntisCard conn={conn('webuntis')} tz={user.timezone} />
        <SchoolCard configured={isConfigured('school')} conn={conn('school')} stats={await schoolStats(user).catch(() => null)} tz={user.timezone} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ImportCard />
        <ManualTimetable entries={await listTimetable(user.id)} breaks={await listBreaks(user.id)} />
      </div>
    </div>
  );
}
