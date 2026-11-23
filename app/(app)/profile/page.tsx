import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { requireReadyUser } from '@/lib/auth';
import { listConnections } from '@/lib/repo';
import { formatDateDe, utcToZoned } from '@/lib/time';
import { Mascot } from '@/components/Mascot';
import { CycleSettings, DangerZone, NotificationSettings, PrefsForm, ProfileForm, SubjectsForm } from './ProfileForms';

export const metadata: Metadata = { title: 'Profil' };

const PROVIDERS = [
  { id: 'webuntis', label: 'WebUntis' }, { id: 'google', label: 'Google Kalender' },
  { id: 'apple', label: 'Apple Kalender' }, { id: 'outlook', label: 'Outlook' },
] as const;

export default async function ProfilePage() {
  const user = await requireReadyUser();
  const conns = await listConnections(user.id);
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Mascot name={user.prefs.mascot} variant="head" size={72} />
        <div>
          <p className="eyebrow">Profil & Einstellungen</p>
          <h1 className="h1">{user.name || user.email}</h1>
          <p className="muted">{user.email} · Mitglied seit {formatDateDe(utcToZoned(user.createdAt, user.timezone).date, { year: true })}</p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileForm name={user.name} userType={user.userType} timezone={user.timezone} mascot={user.prefs.mascot} />

        <section className="card card-pad">
          <div className="flex items-center justify-between">
            <h2 className="h2">Kalenderverbindungen</h2>
            <Link href="/connect" className="btn-ghost btn-sm">Verwalten <ArrowRight size={14} /></Link>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {PROVIDERS.map(p => {
              const c = conns.find(x => x.provider === p.id);
              const status = !c ? 'Nicht verbunden' : c.status === 'expired' ? 'Verbindung abgelaufen' : c.status === 'error' ? 'Fehler' : 'Verbunden';
              const color = !c ? 'bg-paper text-ink-soft' : c.status === 'connected' ? 'bg-leaf-soft text-leaf-dark' : c.status === 'expired' ? 'bg-warn-soft text-[#a55912]' : 'bg-danger-soft text-danger';
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="flex-1 font-semibold">{p.label}</span>
                  {c?.lastSyncAt && <span className="text-xs text-ink-faint">{formatDateDe(utcToZoned(c.lastSyncAt, user.timezone).date)}, {utcToZoned(c.lastSyncAt, user.timezone).time}</span>}
                  <span className={`chip ${color}`}>{status}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <PrefsForm prefs={user.prefs} />
        <div className="space-y-6">
          <SubjectsForm subjects={user.prefs.subjects} />
          <NotificationSettings />
        </div>
        <CycleSettings enabled={user.prefs.cycleEnabled} inCalendar={user.prefs.cycleInCalendar} />
        <DangerZone />
      </div>
    </div>
  );
}
