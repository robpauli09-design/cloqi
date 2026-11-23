'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, MapPin, Repeat } from 'lucide-react';
import { formatDateDe, relativeDayDe, utcToZoned } from '@/lib/time';
import { CATEGORY_META, type CalendarItem } from '@/lib/types';
import { Mascot, type MascotName } from '../Mascot';

const FILTERS = [
  { id: 'today', label: 'Heute' }, { id: 'tomorrow', label: 'Morgen' }, { id: 'week', label: 'Diese Woche' },
  { id: 'nextweek', label: 'Nächste Woche' }, { id: 'month', label: 'Dieser Monat' }, { id: 'custom', label: 'Zeitraum' },
];

export function AgendaView({ items, tz, today, filter, from, to, conflictKeys, onOpen, mascot }: {
  items: CalendarItem[]; tz: string; today: string; filter: string; from: string; to: string;
  conflictKeys: Set<string>; onOpen: (i: CalendarItem) => void; mascot: MascotName;
}) {
  const router = useRouter();
  const [range, setRange] = useState({ from, to });
  const nowIso = new Date().toISOString();
  const upcoming = items.filter(i => i.endAt >= nowIso || utcToZoned(i.startAt, tz).date >= today);
  const groups = new Map<string, CalendarItem[]>();
  for (const i of upcoming) {
    const d = utcToZoned(i.startAt, tz).date;
    groups.set(d, [...(groups.get(d) ?? []), i]);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => router.push(`/calendar?view=agenda&filter=${f.id}`)}
            className={`chip px-3 py-1.5 text-sm transition ${filter === f.id ? 'bg-leaf-dark text-white' : 'bg-white text-ink-soft ring-1 ring-line hover:text-ink'}`}>{f.label}</button>
        ))}
      </div>
      {filter === 'custom' && (
        <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={e => { e.preventDefault(); router.push(`/calendar?view=agenda&filter=custom&from=${range.from}&to=${range.to}`); }}>
          <div><label className="label" htmlFor="ag-from">Von</label><input id="ag-from" type="date" className="input" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} /></div>
          <div><label className="label" htmlFor="ag-to">Bis</label><input id="ag-to" type="date" className="input" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} /></div>
          <button className="btn-primary">Anzeigen</button>
        </form>
      )}
      {groups.size === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center">
          <Mascot name={mascot} variant="bust" size={120} />
          <p className="font-semibold">In diesem Zeitraum ist nichts geplant.</p>
          <p className="muted">Zeit für Freunde, Sport oder einfach Pause.</p>
        </div>
      ) : (
        [...groups].map(([d, list]) => (
          <section key={d} className="card overflow-hidden">
            <h2 className="flex items-baseline gap-2 border-b border-line bg-paper/60 px-5 py-2.5">
              <span className="font-display text-base font-semibold">{relativeDayDe(d, today)}</span>
              <span className="text-xs text-ink-faint">{formatDateDe(d, { weekday: true, year: true })}</span>
            </h2>
            <ul className="divide-y divide-line">
              {list.map(i => {
                const m = CATEGORY_META[i.category];
                return (
                  <li key={i.key}>
                    <button onClick={() => onOpen(i)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-paper/60">
                      <span className="w-24 shrink-0 text-sm font-semibold tabular text-ink-soft">
                        {i.allDay ? 'Ganztägig' : `${utcToZoned(i.startAt, tz).time}–${utcToZoned(i.endAt, tz).time}`}
                      </span>
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: m.color }} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-semibold ${i.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{i.title}{i.status === 'cancelled' && ' – entfällt'}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                          <span>{m.label}</span><span>· {i.calendarLabel}</span>
                          {i.location && <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{i.location}</span>}
                          {i.recurring && <Repeat size={11} />}
                        </span>
                      </span>
                      {conflictKeys.has(i.key) && <span className="chip bg-danger-soft text-danger"><AlertTriangle size={12} /> Konflikt</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
