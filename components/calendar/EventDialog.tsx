'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, Copy, ExternalLink, Info, Loader2, MapPin, Pencil, Repeat, Trash2, UserRound, X } from 'lucide-react';
import {
  createEventAction, deleteBlockAction, deleteEventAction, duplicateEventAction, getEventDetails, updateEventAction, type EventDetails,
} from '@/app/actions/calendar';
import { cancelLessonOnce } from '@/app/actions/settings';
import { RECURRENCE_PRESETS } from '@/lib/recurrence';
import { formatDateDe, utcToZoned } from '@/lib/time';
import { CATEGORIES, CATEGORY_META, type CalendarItem, type UserCalendar } from '@/lib/types';
import { StudyCheck } from '../ItemActions';
import { toastResult } from '../Toaster';
import { CategoryChip, FormMessage, SubmitButton } from '../ui';
import { Select } from '@/components/Select';

export type DialogState =
  | { mode: 'create'; date: string; start: string; end: string }
  | { mode: 'view'; item: CalendarItem }
  | { mode: 'edit'; item: CalendarItem; details: EventDetails; scope: 'single' | 'series' };

const REMINDERS = [
  { v: 'none', l: 'Keine Erinnerung' }, { v: '0', l: 'Zum Beginn' }, { v: '5', l: '5 Minuten vorher' }, { v: '15', l: '15 Minuten vorher' },
  { v: '30', l: '30 Minuten vorher' }, { v: '60', l: '1 Stunde vorher' }, { v: '1440', l: '1 Tag vorher' }, { v: 'custom', l: 'Individuell …' },
];

export function EventDialog({ state, tz, calendars, reminderDefault, onClose, onEdit }: {
  state: DialogState; tz: string; calendars: UserCalendar[]; reminderDefault: number;
  onClose: () => void; onEdit: (s: DialogState) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-lg animate-pop overflow-y-auto rounded-t-3xl bg-white shadow-lift sm:rounded-3xl">
        {state.mode === 'view'
          ? <ItemDetails item={state.item} tz={tz} onClose={onClose} onEdit={onEdit} />
          : <EventForm state={state} calendars={calendars} reminderDefault={reminderDefault} onClose={onClose} />}
      </div>
    </div>
  );
}

function ItemDetails({ item, tz, onClose, onEdit }: { item: CalendarItem; tz: string; onClose: () => void; onEdit: (s: DialogState) => void }) {
  const [pending, start] = useTransition();
  const [askScope, setAskScope] = useState(false);
  const s = utcToZoned(item.startAt, tz);
  const e = utcToZoned(item.endAt, tz);
  const m = CATEGORY_META[item.category];
  const minutes = Math.round((Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toastResult(r);
    if (r.ok) onClose();
  });
  const isEditableEvent = item.kind === 'event' && !item.readOnly && item.source !== 'cycle';

  const sourceNote: Record<string, string> = {
    webuntis: 'Quelle: WebUntis. Änderungen kommen automatisch aus WebUntis – WebUntis bleibt maßgeblich.',
    ics: 'Aus einer importierten Kalenderdatei. Importiere die Datei erneut, um Änderungen zu übernehmen.',
    timetable: 'Teil deines wöchentlichen Stundenplans.',
    cycle: 'Schätzung aus deinen Cycle-Einträgen. Nur in CLOQI sichtbar, wird nie exportiert.',
  };

  return (
    <div>
      <div className="h-2 rounded-t-3xl" style={{ background: item.calendarColor ?? m.color }} />
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className={`font-display text-2xl font-semibold ${item.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{item.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {formatDateDe(s.date, { weekday: true, year: true })}
              {!item.allDay && <> · {s.time}–{e.time} Uhr <span className="text-ink-faint">({minutes} Min)</span></>}
              {item.allDay && ' · ganztägig'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-faint hover:bg-paper" aria-label="Schließen"><X size={18} /></button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <CategoryChip category={item.category} />
          <span className="chip bg-paper text-ink-soft">Quelle: {item.calendarLabel}</span>
          {item.status === 'cancelled' && <span className="chip bg-danger-soft text-danger">Entfällt</span>}
          {item.status === 'done' && <span className="chip bg-leaf-soft text-leaf-dark">Erledigt</span>}
          {item.recurring && <span className="chip bg-paper text-ink-soft"><Repeat size={12} /> Wiederholt sich</span>}
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          {item.location && <Detail icon={<MapPin size={15} />}>{item.location}</Detail>}
          {item.teacher && <Detail icon={<UserRound size={15} />}>{item.teacher}</Detail>}
          {item.reminderMinutes !== null && item.kind !== 'lesson' && (
            <Detail icon={<Bell size={15} />}>Erinnerung {item.reminderMinutes === 0 ? 'zum Beginn' : item.reminderMinutes >= 1440 ? `${Math.round(item.reminderMinutes / 1440)} Tag(e) vorher` : `${item.reminderMinutes} Minuten vorher`}</Detail>
          )}
          {item.description && <Detail icon={<Info size={15} />}><span className="whitespace-pre-line">{item.description}</span></Detail>}
        </dl>
        {sourceNote[item.source] && <p className="mt-4 rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">{sourceNote[item.source]}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {isEditableEvent && (
            <>
              <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
                const details = await getEventDetails(item.id, item.occurrenceDate);
                if (details) onEdit({ mode: 'edit', item, details, scope: item.recurring ? 'single' : 'series' });
              })}><Pencil size={15} /> Bearbeiten</button>
              <button className="btn-outline" disabled={pending} onClick={() => run(() => duplicateEventAction(item.id))}><Copy size={15} /> Duplizieren</button>
              {item.recurring ? (
                askScope ? (
                  <div className="flex w-full flex-wrap gap-2 rounded-xl bg-danger-soft/60 p-3">
                    <span className="w-full text-sm font-semibold text-danger">Was möchtest du löschen?</span>
                    <button className="btn-outline btn-sm" disabled={pending} onClick={() => run(() => deleteEventAction(item.id, 'single', item.occurrenceDate))}>Nur diesen Termin</button>
                    <button className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => deleteEventAction(item.id, 'series'))}>Ganze Serie</button>
                  </div>
                ) : <button className="btn-danger" onClick={() => setAskScope(true)}><Trash2 size={15} /> Löschen</button>
              ) : (
                <button className="btn-danger" disabled={pending} onClick={() => run(() => deleteEventAction(item.id))}><Trash2 size={15} /> Löschen</button>
              )}
            </>
          )}
          {item.kind === 'study' && (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-leaf-soft px-3 py-2 text-sm font-semibold text-leaf-dark">
                <StudyCheck id={item.id} done={item.status === 'done'} /> {item.status === 'done' ? 'Erledigt' : 'Als erledigt abhaken'}
              </div>
              <Link href="/learn" className="btn-outline">Lernplan öffnen</Link>
              <button className="btn-danger" disabled={pending} onClick={() => run(() => deleteBlockAction(item.id))}><Trash2 size={15} /> Entfernen</button>
            </>
          )}
          {item.kind === 'deadline' && <Link href="/learn" className="btn-primary">In Learn öffnen <ExternalLink size={14} /></Link>}
          {item.kind === 'lesson' && item.source === 'timetable' && item.occurrenceDate && (
            <button className="btn-outline" disabled={pending} onClick={() => run(() => cancelLessonOnce(item.id, item.occurrenceDate!))}>Entfällt an diesem Tag</button>
          )}
          {pending && <Loader2 size={18} className="animate-spin self-center text-leaf" />}
        </div>
      </div>
    </div>
  );
}

function Detail({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex gap-2.5 text-ink"><span className="mt-0.5 text-ink-faint">{icon}</span><div>{children}</div></div>;
}

function EventForm({ state, calendars, reminderDefault, onClose }: {
  state: Extract<DialogState, { mode: 'create' | 'edit' }>; calendars: UserCalendar[]; reminderDefault: number; onClose: () => void;
}) {
  const editing = state.mode === 'edit';
  const d = editing ? state.details : null;
  const [scope, setScope] = useState<'single' | 'series'>(editing ? state.scope : 'series');
  const action = editing
    ? updateEventAction.bind(null, d!.id, scope, state.item.occurrenceDate)
    : createEventAction;
  const [result, formAction] = useActionState(action, null);
  const [allDay, setAllDay] = useState(d?.allDay ?? false);
  const [repeat, setRepeat] = useState(d?.repeat ?? 'none');
  const [reminder, setReminder] = useState(() => {
    const v = d ? d.reminderMinutes : reminderDefault;
    if (v === null) return 'none';
    return REMINDERS.some(r => r.v === String(v)) ? String(v) : 'custom';
  });
  const [customReminder, setCustomReminder] = useState(String(d?.reminderMinutes ?? reminderDefault));
  const writable = calendars.filter(c => c.writable && ['cloqi', 'custom', 'google', 'outlook'].includes(c.kind));
  const external = d && ['google', 'outlook'].includes(d.source);

  useEffect(() => { if (result?.ok) { toastResult(result); onClose(); } }, [result, onClose]);

  return (
    <form action={formAction} className="p-6" key={scope}>
      <div className="flex items-center justify-between">
        <h2 className="h2">{editing ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-ink-faint hover:bg-paper" aria-label="Schließen"><X size={18} /></button>
      </div>
      {editing && d!.recurring && !external && (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-paper p-1 text-sm font-semibold">
          {(['single', 'series'] as const).map(sc => (
            <button type="button" key={sc} onClick={() => setScope(sc)} className={`rounded-lg py-2 ${scope === sc ? 'bg-white shadow-sm text-leaf-dark' : 'text-ink-soft'}`}>
              {sc === 'single' ? 'Nur dieser Termin' : 'Gesamte Serie'}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="ev-title">Titel</label>
          <input id="ev-title" name="title" required maxLength={120} defaultValue={d?.title} className="input" placeholder="z. B. Training, Arzt, Mathe lernen" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="ev-date">Datum</label>
            <input id="ev-date" name="date" type="date" required defaultValue={d?.date ?? (state.mode === 'create' ? state.date : '')} className="input" />
          </div>
          {!allDay && <>
            <div><label className="label" htmlFor="ev-start">Beginn</label><input id="ev-start" name="start" type="time" required defaultValue={d?.start ?? (state.mode === 'create' ? state.start : '')} className="input" /></div>
            <div><label className="label" htmlFor="ev-end">Ende</label><input id="ev-end" name="end" type="time" required defaultValue={d?.end ?? (state.mode === 'create' ? state.end : '')} className="input" /></div>
          </>}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="allDay" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="h-4 w-4 accent-[#7CC51B]" /> Ganztägig</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ev-cat">Kategorie</label>
            <Select id="ev-cat" name="category" defaultValue={d?.category ?? 'privat'} className="input">
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="ev-cal">Kalender</label>
            <Select id="ev-cal" name="calendarId" defaultValue={d?.calendarId ?? writable[0]?.id} className="input" disabled={Boolean(external)}>
              {writable.map(c => <option key={c.id} value={c.id}>{c.name}{c.kind === 'google' ? ' (Google)' : c.kind === 'outlook' ? ' (Outlook)' : ''}</option>)}
            </Select>
            {external && <input type="hidden" name="calendarId" value={d!.calendarId ?? ''} />}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ev-loc">Standort</label>
          <input id="ev-loc" name="location" maxLength={200} defaultValue={d?.location ?? ''} className="input" placeholder="optional" />
        </div>
        <div>
          <label className="label" htmlFor="ev-desc">Beschreibung</label>
          <textarea id="ev-desc" name="description" rows={2} maxLength={2000} defaultValue={d?.description ?? ''} className="input" placeholder="optional" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ev-rem">Erinnerung</label>
            <Select id="ev-rem" value={reminder} onChange={e => setReminder(e.target.value)} className="input">
              {REMINDERS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
            </Select>
            {reminder === 'custom' && (
              <input type="number" min={0} max={10080} value={customReminder} onChange={e => setCustomReminder(e.target.value)} className="input mt-2" aria-label="Minuten vorher" />
            )}
            <input type="hidden" name="reminder" value={reminder === 'custom' ? customReminder : reminder} />
          </div>
          {(!editing || scope === 'series') && !external && (
            <div>
              <label className="label" htmlFor="ev-rep">Wiederholung</label>
              <Select id="ev-rep" name="repeat" value={repeat} onChange={e => setRepeat(e.target.value)} className="input">
                {RECURRENCE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </div>
          )}
        </div>
        {repeat === 'custom' && (!editing || scope === 'series') && (
          <div className="flex items-center gap-2 text-sm">
            Alle <input name="repeatInterval" type="number" min={1} max={99} defaultValue={d?.repeatInterval ?? 1} className="input w-20" aria-label="Intervall" />
            <Select name="repeatUnit" defaultValue={d?.repeatUnit ?? 'weekly'} className="input w-36" aria-label="Einheit">
              <option value="daily">Tage</option><option value="weekly">Wochen</option><option value="monthly">Monate</option><option value="yearly">Jahre</option>
            </Select>
          </div>
        )}
        {repeat !== 'none' && (!editing || scope === 'series') && (
          <div>
            <label className="label" htmlFor="ev-until">Wiederholen bis (optional)</label>
            <input id="ev-until" name="until" type="date" defaultValue={d?.until ?? ''} className="input" />
          </div>
        )}
        <FormMessage state={result && !result.ok ? result : null} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Abbrechen</button>
        <SubmitButton pendingText="Speichern …">{editing ? 'Speichern' : 'Termin erstellen'}</SubmitButton>
      </div>
    </form>
  );
}
