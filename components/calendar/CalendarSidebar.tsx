'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { deleteCalendarAction, saveCalendarAction, toggleCalendarVisibility } from '@/app/actions/calendar';
import { CATEGORIES, CATEGORY_META, type UserCalendar } from '@/lib/types';
import { FormMessage, SubmitButton } from '../ui';
import { toastResult } from '../Toaster';

const KIND_HINT: Record<string, string> = {
  cloqi: 'Hauptkalender', study: 'CLOQI AI', timetable: 'Manuell / CSV', webuntis: 'WebUntis', google: 'Google', outlook: 'Outlook', ics: 'Importiert', custom: 'Eigener Kalender',
};
const COLORS = ['#7CC51B', '#286B24', '#1FA59A', '#3B82F6', '#9A7B4F', '#E06A9E', '#F08C2E', '#5B6472'];

export function CalendarSidebar({ calendars }: { calendars: UserCalendar[]; today: string; date: string }) {
  return (
    <aside className="hidden w-60 shrink-0 xl:block">
      <div className="card sticky top-6 p-4"><CalendarList calendars={calendars} /></div>
    </aside>
  );
}

/** Calendar groups with visibility toggles – used in the sidebar and in a collapsible panel on small screens. */
export function CalendarList({ calendars }: { calendars: UserCalendar[] }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [state, action] = useActionState(saveCalendarAction, null);
  return (
    <>
        <p className="eyebrow mb-3">Meine Kalender</p>
        <ul className="space-y-1">
          {calendars.map(c => (
            <li key={c.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-paper">
              <input
                id={`cal-${c.id}`} type="checkbox" checked={c.visible} disabled={pending}
                onChange={e => start(async () => toastResult(await toggleCalendarVisibility(c.id, e.target.checked)))}
                className="h-4 w-4 cursor-pointer rounded" style={{ accentColor: c.color }}
              />
              <label htmlFor={`cal-${c.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-[10px] text-ink-faint">{KIND_HINT[c.kind]}{!c.writable && ' · nur lesen'}</span>
              </label>
              {c.kind === 'custom' && (
                <button aria-label={`${c.name} löschen`} className="rounded p-1 text-ink-faint opacity-0 hover:text-danger group-hover:opacity-100"
                  onClick={() => { if (window.confirm(`Kalender „${c.name}“ und alle seine Termine löschen?`)) start(async () => toastResult(await deleteCalendarAction(c.id))); }}>
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {adding ? (
          <form action={action} className="mt-3 space-y-2 rounded-xl bg-paper p-3">
            <input name="name" required maxLength={40} placeholder="z. B. Familie" className="input py-2" aria-label="Name des Kalenders" />
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((col, i) => (
                <label key={col} className="cursor-pointer">
                  <input type="radio" name="color" value={col} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="block h-6 w-6 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink" style={{ background: col }} />
                </label>
              ))}
            </div>
            <FormMessage state={state} />
            <div className="flex gap-2"><SubmitButton className="btn-primary btn-sm">Erstellen</SubmitButton><button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Abbrechen</button></div>
          </form>
        ) : (
          <button className="btn-ghost btn-sm mt-2 w-full justify-start" onClick={() => setAdding(true)}><Plus size={14} /> Kalender hinzufügen</button>
        )}
        <Link href="/connect" className="btn-outline btn-sm mt-2 w-full"><Link2 size={14} /> Kalender verbinden</Link>

        <p className="eyebrow mb-2 mt-6">Kategorien</p>
        <ul className="space-y-1.5">
          {CATEGORIES.map(c => (
            <li key={c} className="flex items-center gap-2 text-xs font-medium text-ink-soft">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[c].color }} />{CATEGORY_META[c].label}
            </li>
          ))}
        </ul>
    </>
  );
}
