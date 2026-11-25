import type { Metadata } from 'next';
import { Apple, BookOpenText, ClipboardList, FileUp, School } from 'lucide-react';
import { requireReadyUser } from '@/lib/auth';
import { feedUrls } from '@/lib/feed';
import { isConfigured } from '@/lib/integrations';
import { getConnection, listBreaks, listTimetable } from '@/lib/repo';
import { formatDateDe, utcToZoned } from '@/lib/time';
import { Mascot } from '@/components/Mascot';
import { schoolStats } from '@/lib/school';
import { AppleCard, ImportCard, ManualTimetable, ProviderCard, SchoolCard, WebUntisCard } from './ConnectCards';
import { ConnectHub, type HubItem } from './ConnectHub';

export const metadata: Metadata = { title: 'Kalender verbinden' };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireReadyUser();
  const tz = user.timezone;
  const { ok, error } = await searchParams;
  const conns = Object.fromEntries(await Promise.all((['google', 'outlook', 'webuntis', 'apple', 'school'] as const).map(async p => {
    const c = await getConnection(user.id, p);
    return [p, c ? { status: c.status, lastSyncAt: c.lastSyncAt, lastError: c.lastError, config: c.config } : null] as const;
  })));
  type P = 'google' | 'outlook' | 'webuntis' | 'apple' | 'school';
  const conn = (p: P) => conns[p];
  const when = (iso: string | null) => (iso ? `zuletzt ${formatDateDe(utcToZoned(iso, tz).date)}, ${utcToZoned(iso, tz).time}` : 'noch nicht synchronisiert');
  const state = (p: P, configured = true): HubItem['state'] => {
    const c = conn(p);
    if (!configured && !c) return 'soon';
    if (!c) return 'available';
    return c.status === 'connected' ? 'connected' : 'problem';
  };
  const [timetable, breaks, stats, urls] = await Promise.all([listTimetable(user.id), listBreaks(user.id), schoolStats(user).catch(() => null), feedUrls(user)]);
  const untis = conn('webuntis')?.config.untis;

  const groups: { title: string; hint: string; items: HubItem[] }[] = [
    {
      title: 'Stundenplan', hint: 'Damit CLOQI weiß, wann du Schule hast',
      items: [
        {
          id: 'webuntis', name: 'WebUntis', icon: <School size={20} className="text-leaf-dark" />, state: state('webuntis'),
          description: 'Normalen WebUntis-Link einfügen – Entfall und Schularbeiten kommen automatisch',
          detail: conn('webuntis') ? `${untis ? `Klasse ${untis.label} · ` : ''}${when(conn('webuntis')!.lastSyncAt)}` : undefined,
          panel: <WebUntisCard conn={conn('webuntis')} tz={tz} />,
        },
        {
          id: 'manual', name: 'Selbst eintragen', icon: <ClipboardList size={20} className="text-leaf-dark" />,
          state: timetable.length ? 'connected' : 'available', action: 'Eintragen', description: 'Fach, Tag und Uhrzeit – falls deine Schule kein WebUntis hat',
          detail: timetable.length ? `${timetable.length} Unterrichtseinheit${timetable.length === 1 ? '' : 'en'} eingetragen` : undefined,
          panel: <ManualTimetable entries={timetable} breaks={breaks} />,
        },
        {
          id: 'import', name: 'Datei importieren', icon: <FileUp size={20} className="text-leaf-dark" />, state: 'available', action: 'Importieren',
          description: 'ICS- oder CSV-Datei, z. B. aus einem Uni-Portal', panel: <ImportCard />,
        },
      ],
    },
    {
      title: 'Kalender', hint: 'Alle Termine an einem Ort',
      items: [
        {
          id: 'google', name: 'Google Kalender', icon: <span className="text-info">G</span>, state: state('google', isConfigured('google')),
          description: 'Termine in beide Richtungen abgleichen', detail: conn('google') ? when(conn('google')!.lastSyncAt) : undefined,
          panel: <ProviderCard provider="google" configured={isConfigured('google')} conn={conn('google')} tz={tz} />,
        },
        {
          id: 'apple', name: 'Apple Kalender', icon: <Apple size={20} className="text-ink" />, state: conn('apple') ? 'connected' : 'available',
          description: 'CLOQI auf iPhone, iPad und Mac anzeigen (Abo-Link)', detail: conn('apple') ? 'Abo-Link aktiv' : undefined,
          panel: <AppleCard conn={conn('apple')} urls={urls} tz={tz} />,
        },
        {
          id: 'outlook', name: 'Microsoft Outlook', icon: <span className="text-[#0F6CBD]">O</span>, state: state('outlook', isConfigured('outlook')),
          description: 'Termine in beide Richtungen abgleichen', detail: conn('outlook') ? when(conn('outlook')!.lastSyncAt) : undefined,
          panel: <ProviderCard provider="outlook" configured={isConfigured('outlook')} conn={conn('outlook')} tz={tz} />,
        },
      ],
    },
    {
      title: 'Schule', hint: 'Optional – nur wenn deine Schule das nutzt',
      items: [
        {
          id: 'schule', name: 'Teams & OneNote', icon: <BookOpenText size={20} className="text-[#5B5FC7]" />, state: state('school', isConfigured('school')),
          description: 'Hausübungen automatisch eintragen, Stoff für CLOQI AI nachschlagen (nur lesen)',
          detail: stats ? `${stats.openHomework} offene Hausübung${stats.openHomework === 1 ? '' : 'en'} · ${stats.pages} OneNote-Seiten` : undefined,
          panel: <SchoolCard configured={isConfigured('school')} conn={conn('school')} stats={stats} tz={tz} />,
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header className="flex items-end gap-4">
        <div className="flex-1">
          <p className="eyebrow">Kalender verbinden</p>
          <h1 className="h1">Alle Kalender. Ein Ort.</h1>
          <p className="muted mt-1">Verbinde einmal – CLOQI führt alles zusammen. Jede Verbindung kannst du jederzeit ändern oder trennen.</p>
        </div>
        <Mascot name={user.prefs.mascot} variant="bust" size={92} className="hidden sm:block" />
      </header>
      {ok && <p className="rounded-xl bg-leaf-soft px-4 py-3 text-sm font-medium text-leaf-dark">{ok}</p>}
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      <ConnectHub groups={groups} />
    </div>
  );
}
