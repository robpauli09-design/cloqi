'use client';

import { useActionState, useState, useTransition } from 'react';
import { Apple, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CheckCircle2, Copy, FileUp, Loader2, RefreshCw, School, Trash2, Unplug, XCircle } from 'lucide-react';
import {
  addHoliday, addLesson, connectWebUntis, disconnect, enableAppleFeed, importTimetableFile, refreshProviderCalendars, removeHoliday,
  removeLesson, saveFeedCategories, saveProviderSettings, syncNow,
} from '@/app/actions/settings';
import { formatDateDe, utcToZoned, WEEKDAYS_DE, WEEKDAYS_SHORT_DE } from '@/lib/time';
import { CATEGORIES, CATEGORY_META, type ConnectionConfig, type TimetableEntry } from '@/lib/types';
import type { TimetableBreak } from '@/lib/repo';
import { toast, toastResult } from '@/components/Toaster';
import { FormMessage, SubmitButton } from '@/components/ui';

interface Conn { status: string; lastSyncAt: string | null; lastError: string | null; config: ConnectionConfig }

function Status({ conn, tz }: { conn: Conn | null; tz: string }) {
  if (!conn) return <span className="chip bg-paper text-ink-soft"><XCircle size={13} /> Nicht verbunden</span>;
  const last = conn.lastSyncAt ? `${formatDateDe(utcToZoned(conn.lastSyncAt, tz).date)}, ${utcToZoned(conn.lastSyncAt, tz).time}` : 'noch nie';
  const chip = conn.status === 'expired'
    ? <span className="chip bg-warn-soft text-[#a55912]">Verbindung abgelaufen</span>
    : conn.status === 'error' ? <span className="chip bg-danger-soft text-danger">Fehler</span>
    : <span className="chip bg-leaf-soft text-leaf-dark"><CheckCircle2 size={13} /> Verbunden</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip}<span className="text-xs text-ink-faint">Letzte Synchronisierung: {last}</span>
      {conn.lastError && <p className="w-full text-xs text-danger">{conn.lastError}</p>}
    </div>
  );
}

function Card({ title, logo, children }: { title: string; logo: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card card-pad flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-paper text-lg font-bold">{logo}</span>
        <h2 className="h2">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [React.ReactNode, string, string][] }) {
  return (
    <ul className="space-y-1.5 rounded-xl bg-paper/70 p-3 text-xs">
      {rows.map(([icon, k, v]) => <li key={k} className="flex gap-2"><span className="text-leaf-dark">{icon}</span><span className="w-32 shrink-0 font-semibold text-ink-soft">{k}</span><span>{v}</span></li>)}
    </ul>
  );
}

function SyncButtons({ provider }: { provider: 'google' | 'outlook' | 'webuntis' | 'apple' }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {provider !== 'apple' && (
        <button className="btn-outline btn-sm" disabled={pending} onClick={() => start(async () => toastResult(await syncNow(provider)))}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Jetzt synchronisieren
        </button>
      )}
      <button className="btn-danger btn-sm" disabled={pending} onClick={() => {
        if (window.confirm('Verbindung trennen? Importierte Termine werden aus CLOQI entfernt.')) start(async () => toastResult(await disconnect(provider)));
      }}><Unplug size={14} /> Trennen</button>
    </div>
  );
}

export function ProviderCard({ provider, configured, conn, tz }: { provider: 'google' | 'outlook'; configured: boolean; conn: Conn | null; tz: string }) {
  const name = provider === 'google' ? 'Google Kalender' : 'Microsoft Outlook';
  const [state, action] = useActionState(saveProviderSettings.bind(null, provider), null);
  const [pending, start] = useTransition();
  const cals = conn?.config.availableCalendars ?? [];
  return (
    <Card title={name} logo={<span className={provider === 'google' ? 'text-info' : 'text-[#0F6CBD]'}>{provider === 'google' ? 'G' : 'O'}</span>}>
      <Status conn={conn} tz={tz} />
      <Facts rows={[
        [<ArrowLeftRight key="a" size={13} />, 'Richtung', 'Beidseitig: Import deiner Kalender + Export von CLOQI-Terminen'],
        [<ArrowDownToLine key="b" size={13} />, 'Berechtigungen', provider === 'google' ? 'Termine lesen & schreiben, Kalenderliste lesen' : 'Calendars.ReadWrite, offline_access'],
        [<ArrowUpFromLine key="c" size={13} />, 'Schnittstelle', provider === 'google' ? 'Google Calendar API, OAuth 2.0' : 'Microsoft Graph API, OAuth 2.0'],
      ]} />
      {!configured && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-[#8a4a0e]">
          Auf diesem Server ist {name} noch nicht eingerichtet: Es fehlen {provider === 'google' ? 'GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET' : 'MICROSOFT_CLIENT_ID und MICROSOFT_CLIENT_SECRET'} (siehe README).
          Es wird keine Verbindung vorgetäuscht.
        </p>
      )}
      {!conn ? (
        configured
          ? <a href={`/api/integrations/${provider}/start`} className="btn-primary self-start">Mit {provider === 'google' ? 'Google' : 'Microsoft'} verbinden</a>
          : <button disabled className="btn-primary self-start">Mit {provider === 'google' ? 'Google' : 'Microsoft'} verbinden</button>
      ) : (
        <>
          {conn.status === 'expired' && <a href={`/api/integrations/${provider}/start`} className="btn-primary self-start">Neu verbinden</a>}
          <form action={action} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="label !mb-0">Diese Kalender in CLOQI anzeigen (Import)</p>
              <button type="button" className="text-xs font-semibold text-leaf-dark" disabled={pending}
                onClick={() => start(async () => toastResult(await refreshProviderCalendars(provider)))}>Liste aktualisieren</button>
            </div>
            <div className="space-y-1.5">
              {cals.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="import" value={c.id} defaultChecked={conn.config.importCalendarIds?.includes(c.id)} className="h-4 w-4 accent-[#7CC51B]" />
                  {c.name} {c.primary && <span className="chip bg-paper text-ink-faint">Haupt</span>} {!c.writable && <span className="text-xs text-ink-faint">(nur lesen)</span>}
                </label>
              ))}
            </div>
            <div>
              <label className="label" htmlFor={`${provider}-export`}>CLOQI-Termine übertragen nach</label>
              <select id={`${provider}-export`} name="exportCalendarId" defaultValue={conn.config.exportCalendarId ?? ''} className="input">
                <option value="">Nicht übertragen</option>
                {cals.filter(c => c.writable).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <CategoryPicker name="exportCategories" selected={conn.config.exportCategories ?? []} label="Welche Kategorien werden übertragen?" />
            <FormMessage state={state} />
            <SubmitButton className="btn-primary btn-sm">Einstellungen speichern</SubmitButton>
          </form>
          <SyncButtons provider={provider} />
        </>
      )}
    </Card>
  );
}

function CategoryPicker({ name, selected, label }: { name: string; selected: string[]; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(c => (
          <label key={c} className="cursor-pointer">
            <input type="checkbox" name={name} value={c} defaultChecked={selected.includes(c)} className="peer sr-only" />
            <span className="chip border border-line bg-white text-ink-soft peer-checked:border-transparent peer-checked:bg-leaf-soft peer-checked:text-leaf-dark peer-focus-visible:ring-2 peer-focus-visible:ring-leaf">
              <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c].color }} />{CATEGORY_META[c].label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AppleCard({ conn, urls, tz }: { conn: Conn | null; urls: { https: string; webcal: string } | null; tz: string }) {
  const [pending, start] = useTransition();
  const [state, action] = useActionState(saveFeedCategories, null);
  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast('Link kopiert.'); } catch { toast('Kopieren nicht möglich – bitte manuell markieren.', 'error'); }
  };
  return (
    <Card title="Apple Kalender / iCloud" logo={<Apple size={20} className="text-ink" />}>
      <Status conn={conn} tz={tz} />
      <Facts rows={[
        [<ArrowUpFromLine key="a" size={13} />, 'Richtung', 'Einseitig: CLOQI → Apple Kalender (Abo, nur lesbar)'],
        [<ArrowDownToLine key="b" size={13} />, 'Geräte', 'iPhone, iPad, Mac – über einen persönlichen webcal-Link'],
        [<ArrowLeftRight key="c" size={13} />, 'Beidseitig?', 'Noch nicht. Dafür braucht es CalDAV bzw. die native iOS-App (EventKit) – geplant.'],
      ]} />
      {!urls ? (
        <button className="btn-primary self-start" disabled={pending} onClick={() => start(async () => toastResult(await enableAppleFeed()))}>
          {pending && <Loader2 size={14} className="animate-spin" />} Persönlichen Kalender-Link erstellen
        </button>
      ) : (
        <>
          <div className="space-y-2">
            <a href={urls.webcal} className="btn-primary w-full sm:w-auto">In Apple Kalender abonnieren</a>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{urls.https}</code>
              <button className="btn-ghost btn-sm" onClick={() => copy(urls.https)} aria-label="Link kopieren"><Copy size={14} /></button>
            </div>
            <p className="text-xs text-ink-faint">iPhone: Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen. Den Link nicht teilen – wer ihn kennt, sieht deinen Kalender.</p>
          </div>
          <form action={action} className="space-y-3">
            <CategoryPicker name="exportCategories" selected={conn?.config.exportCategories ?? []} label="Diese Kategorien im Abo anzeigen" />
            <FormMessage state={state} />
            <SubmitButton className="btn-outline btn-sm">Speichern</SubmitButton>
          </form>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline btn-sm" disabled={pending} onClick={() => { if (window.confirm('Neuen Link erzeugen? Der alte funktioniert danach nicht mehr.')) start(async () => toastResult(await enableAppleFeed())); }}>
              <RefreshCw size={14} /> Neuen Link erzeugen
            </button>
            <SyncButtons provider="apple" />
          </div>
        </>
      )}
    </Card>
  );
}

export function WebUntisCard({ conn, tz }: { conn: Conn | null; tz: string }) {
  const [state, action] = useActionState(connectWebUntis, null);
  return (
    <Card title="WebUntis" logo={<School size={20} className="text-leaf-dark" />}>
      <div id="webuntis" className="-mt-20 pt-20" />
      <Status conn={conn} tz={tz} />
      <Facts rows={[
        [<ArrowDownToLine key="a" size={13} />, 'Richtung', 'Import: WebUntis → CLOQI (WebUntis bleibt maßgeblich)'],
        [<CheckCircle2 key="b" size={13} />, 'Was kommt rein', 'Stunden, Fächer, Räume, Entfall, Verschiebungen – soweit im Kalender-Link enthalten'],
        [<ArrowLeftRight key="c" size={13} />, 'Zugang', 'Dein persönlicher iCal-Link aus WebUntis – kein Passwort nötig'],
      ]} />
      <details className="rounded-xl bg-paper/70 p-3 text-sm" open={!conn}>
        <summary className="cursor-pointer font-semibold">So findest du deinen WebUntis-Kalender-Link</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-soft">
          <li>WebUntis im Browser öffnen und anmelden.</li>
          <li>„Mein Stundenplan“ → <b>iCal-Abo verwalten</b> (bzw. Profil → Datenzugriff → „Kalender veröffentlichen“).</li>
          <li><b>Link erstellen</b> und <b>Link kopieren</b>.</li>
          <li>Hier einfügen. Der Link der Stundenplan-<i>Ansicht</i> (…#/basic/timetable…) funktioniert nicht.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-faint">Nicht jede Schule schaltet diese Funktion frei. Falls sie fehlt: Stundenplan als Datei importieren oder manuell anlegen.</p>
      </details>
      <form action={action} className="space-y-3">
        <label className="label" htmlFor="wu-url">{conn ? 'Neuen Kalender-Link speichern' : 'Kalender-Link aus WebUntis'}</label>
        <input id="wu-url" name="url" required className="input" placeholder="https://schule.webuntis.com/WebUntis/ical.do?…" autoComplete="off" />
        <FormMessage state={state} />
        <SubmitButton pendingText="Verbinde & lade Stundenplan …">Mit WebUntis verbinden</SubmitButton>
      </form>
      {conn && <SyncButtons provider="webuntis" />}
    </Card>
  );
}

export function ImportCard() {
  const [state, action] = useActionState(importTimetableFile, null);
  return (
    <Card title="Andere Kalender & Stundenpläne importieren" logo={<FileUp size={20} className="text-leaf-dark" />}>
      <div id="import" className="-mt-20 pt-20" />
      <p className="muted">ICS-Dateien (aus Google, Outlook, Apple, Uni-Portalen …) oder einen Stundenplan als CSV.</p>
      <form action={action} className="space-y-3">
        <input name="file" type="file" accept=".ics,.csv,text/calendar,text/csv" required className="input file:mr-3 file:rounded-lg file:border-0 file:bg-leaf-soft file:px-3 file:py-1.5 file:font-semibold file:text-leaf-dark" />
        <div>
          <label className="label" htmlFor="imp-cat">Kategorie für ICS-Termine</label>
          <select id="imp-cat" name="category" defaultValue="schule" className="input">
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
          </select>
        </div>
        <FormMessage state={state} />
        <SubmitButton pendingText="Importiere …">Importieren</SubmitButton>
      </form>
      <details className="text-xs text-ink-soft">
        <summary className="cursor-pointer font-semibold">CSV-Format</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-paper p-3">Fach;Wochentag;Beginn;Ende;Raum;Lehrer{'\n'}Mathematik;Montag;08:00;09:40;R4DK;HOF{'\n'}Englisch;Di;10:00;10:50;R1;</pre>
        <p className="mt-1">Mehrmaliges Importieren derselben ICS-Datei aktualisiert die Termine statt sie zu verdoppeln.</p>
      </details>
    </Card>
  );
}

export function ManualTimetable({ entries, breaks }: { entries: TimetableEntry[]; breaks: TimetableBreak[] }) {
  const [state, action] = useActionState(addLesson, null);
  const [hState, hAction] = useActionState(addHoliday, null);
  const [pending, start] = useTransition();
  const [day, setDay] = useState(1);
  return (
    <Card title="Stundenplan manuell erstellen" logo={<span className="text-leaf-dark">📋</span>}>
      <div id="manual" className="-mt-20 pt-20" />
      <form action={action} className="grid gap-3 sm:grid-cols-2" key={state?.ok ? state.message : 'lesson'}>
        <div><label className="label" htmlFor="l-subject">Fach</label><input id="l-subject" name="subject" required maxLength={60} className="input" /></div>
        <div>
          <label className="label" htmlFor="l-day">Wochentag</label>
          <select id="l-day" name="weekday" value={day} onChange={e => setDay(Number(e.target.value))} className="input">
            {WEEKDAYS_DE.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="l-start">Beginn</label><input id="l-start" name="start" type="time" required defaultValue="08:00" className="input" /></div>
        <div><label className="label" htmlFor="l-end">Ende</label><input id="l-end" name="end" type="time" required defaultValue="08:50" className="input" /></div>
        <div><label className="label" htmlFor="l-room">Raum</label><input id="l-room" name="room" maxLength={40} className="input" /></div>
        <div><label className="label" htmlFor="l-teacher">Lehrer/in</label><input id="l-teacher" name="teacher" maxLength={60} className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="l-inst">Schule / Universität</label><input id="l-inst" name="institution" maxLength={80} className="input" /></div>
        <div className="sm:col-span-2"><FormMessage state={state} /></div>
        <div className="sm:col-span-2"><SubmitButton>Unterrichtseinheit hinzufügen</SubmitButton></div>
      </form>
      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <tbody className="divide-y divide-line">
              {entries.map(e => (
                <tr key={e.id}>
                  <td className="py-2 font-semibold">{WEEKDAYS_SHORT_DE[e.weekday - 1]}</td>
                  <td className="tabular text-ink-soft">{e.startTime}–{e.endTime}</td>
                  <td className="font-medium">{e.subject}</td>
                  <td className="text-ink-soft">{[e.room, e.teacher].filter(Boolean).join(' · ')}</td>
                  <td className="text-right">
                    <button aria-label={`${e.subject} löschen`} disabled={pending} className="btn-ghost btn-sm" onClick={() => start(async () => toastResult(await removeLesson(e.id)))}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-line pt-4">
        <p className="label">Ferien & Feiertage (kein Unterricht)</p>
        <form action={hAction} className="flex flex-wrap items-end gap-2" key={hState?.ok ? hState.message : 'h'}>
          <input name="name" maxLength={40} placeholder="z. B. Weihnachtsferien" className="input w-48" aria-label="Bezeichnung" />
          <input name="from" type="date" required className="input w-40" aria-label="Von" />
          <input name="to" type="date" required className="input w-40" aria-label="Bis" />
          <SubmitButton className="btn-outline">Hinzufügen</SubmitButton>
        </form>
        <FormMessage state={hState && !hState.ok ? hState : null} />
        <ul className="mt-2 space-y-1">
          {breaks.map(b => (
            <li key={b.id} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{b.name}</span>
              <span className="text-ink-soft">{formatDateDe(b.startDate)} – {formatDateDe(b.endDate, { year: true })}</span>
              <button aria-label="Entfernen" className="btn-ghost btn-sm" onClick={() => start(async () => toastResult(await removeHoliday(b.id)))}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
