'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { searchCalendarAction } from '@/app/actions/calendar';
import { formatDateDe, utcToZoned } from '@/lib/time';
import { CATEGORY_META, type CalendarItem } from '@/lib/types';

export interface CalendarSearchHandle { focus(): void }

/** Search box like Google Calendar: title, place, notes, teacher – results open the entry. */
export const CalendarSearch = forwardRef<CalendarSearchHandle, { tz: string; onOpen(item: CalendarItem): void }>(function CalendarSearch({ tz, onOpen }, ref) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<CalendarItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => { input.current?.focus(); setOpen(true); } })); // focus at once: the next typed letter must land in the box

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchCalendarAction(q).catch(() => []);
      if (alive) { setHits(r); setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={root} className="relative">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm focus-within:border-leaf">
        <Search size={16} className="shrink-0 text-ink-faint" />
        <input ref={input} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') { setQ(''); setOpen(false); input.current?.blur(); } }}
          placeholder="Suchen" aria-label="Termine suchen" className="w-full min-w-0 bg-transparent outline-none lg:w-40" />
        {loading ? <Loader2 size={14} className="animate-spin text-leaf" /> : q && <button type="button" aria-label="Suche leeren" onClick={() => setQ('')}><X size={14} className="text-ink-faint" /></button>}
      </label>
      {open && hits && (
        <div className="absolute right-0 z-30 mt-1 max-h-96 w-[min(22rem,90vw)] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-lift" role="listbox">
          {!hits.length && <p className="px-3 py-3 text-sm text-ink-soft">Nichts gefunden.</p>}
          {hits.map(i => {
            const z = utcToZoned(i.startAt, tz);
            return (
              <button key={i.key} type="button" role="option" aria-selected={false} onClick={() => { setOpen(false); onOpen(i); }}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-paper">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.calendarColor ?? CATEGORY_META[i.category].color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.title}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {formatDateDe(z.date, { weekday: true, year: true })}{i.allDay ? '' : `, ${z.time}`}{i.location ? ` · ${i.location}` : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
