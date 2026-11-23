import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { feedUrls } from '@/lib/feed';
import { isConfigured } from '@/lib/integrations';
import { getConnection, listBreaks, listTimetable } from '@/lib/repo';
import { Mascot } from '@/components/Mascot';
import { AppleCard, ImportCard, ManualTimetable, ProviderCard, WebUntisCard } from './ConnectCards';

export const metadata: Metadata = { title: 'Kalender verbinden' };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireReadyUser();
  const { ok, error } = await searchParams;
  const conn = (p: 'google' | 'outlook' | 'webuntis' | 'apple') => {
    const c = getConnection(user.id, p);
    return c ? { status: c.status, lastSyncAt: c.lastSyncAt, lastError: c.lastError, config: c.config } : null;
  };
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
        <AppleCard conn={conn('apple')} urls={feedUrls(user)} tz={user.timezone} />
        <WebUntisCard conn={conn('webuntis')} tz={user.timezone} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ImportCard />
        <ManualTimetable entries={listTimetable(user.id)} breaks={listBreaks(user.id)} />
      </div>
    </div>
  );
}
