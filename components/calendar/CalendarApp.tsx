'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { findConflicts } from '@/lib/conflicts';
import { addDays, formatDateDe, MONTHS_DE, startOfWeek } from '@/lib/time';
import type { CalendarItem, UserCalendar } from '@/lib/types';
import type { MascotName } from '../Mascot';
import { CalendarList, CalendarSidebar } from './CalendarSidebar';
import { TimeGrid } from './TimeGrid';
import { MonthView } from './MonthView';
import { AgendaView } from './AgendaView';
import { EventDialog, type DialogState } from './EventDialog';

export type CalendarView = 'day' | 'week' | 'month' | 'agenda';

export interface CalendarAppProps {
  view: CalendarView; explicitView?: boolean; date: string; today: string; tz: string; filter: string; rangeFrom: string; rangeTo: string;
  items: CalendarItem[]; calendars: UserCalendar[]; mascot: MascotName; reminderDefault: number;
}

const VIEW_LABEL: Record<CalendarView, string> = { day: 'Tag', week: 'Woche', month: 'Monat', agenda: 'Agenda' };

export function CalendarApp(props: CalendarAppProps) {
  const { view, date, today, tz, items, calendars } = props;
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // phones open the day view (like Google Calendar) unless a view was chosen explicitly
  useEffect(() => {
    if (!props.explicitView && view === 'week' && window.matchMedia('(max-width: 1023px)').matches) router.replace(`/calendar?view=day&date=${date}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // swipe left/right in the day view = next/previous day
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      const t = touch.current; touch.current = null;
      if (!t || view !== 'day') return;
      const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
    },
  };
  const go = (params: Record<string, string>) => router.push(`/calendar?${new URLSearchParams({ view, date, ...params })}`);
  const conflictKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of findConflicts(items)) { s.add(c.a.key); s.add(c.b.key); }
    return s;
  }, [items]);

  const step = (dir: 1 | -1) => {
    if (view === 'day') return go({ date: addDays(date, dir) });
    if (view === 'week') return go({ date: addDays(date, 7 * dir) });
    if (view === 'month') {
      const [y, m] = date.split('-').map(Number);
      const nm = m + dir;
      const d = new Date(Date.UTC(y, nm - 1, 1)).toISOString().slice(0, 10);
      return go({ date: d });
    }
  };

  const title = (() => {
    if (view === 'day') return formatDateDe(date, { weekday: true, year: true });
    if (view === 'week') {
      const s = startOfWeek(date);
      const e = addDays(s, 6);
      return `${formatDateDe(s)} – ${formatDateDe(e, { year: true })}`;
    }
    if (view === 'month') return `${MONTHS_DE[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
    return 'Agenda';
  })();

  const openCreate = (d: string, start = '09:00', end = '10:00') => setDialog({ mode: 'create', date: d, start, end });
  const openItem = (item: CalendarItem) => setDialog({ mode: 'view', item });

  return (
    <div className="flex gap-6">
      <CalendarSidebar calendars={calendars} today={today} date={date} />
      <div className="min-w-0 flex-1">
        <header className="mb-4 flex flex-wrap items-center gap-2 lg:gap-3">
          <div className="mr-auto min-w-0">
            <p className="eyebrow hidden lg:block">Kalender</p>
            <h1 className="truncate font-display text-xl font-semibold lg:text-3xl">{title}</h1>
          </div>
          <div className="order-last flex w-full rounded-xl border border-line bg-white p-1 text-sm font-semibold lg:order-none lg:w-auto [&>button]:flex-1 lg:[&>button]:flex-none" role="tablist" aria-label="Ansicht">
            {(Object.keys(VIEW_LABEL) as CalendarView[]).map(v => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => router.push(`/calendar?view=${v}&date=${date}`)}
                className={`rounded-lg px-3 py-1.5 transition ${view === v ? 'bg-leaf-dark text-white' : 'text-ink-soft hover:text-ink'}`}>{VIEW_LABEL[v]}</button>
            ))}
          </div>
          {view !== 'agenda' && (
            <div className="flex items-center gap-1">
              <button className="btn-outline btn-sm h-9 w-9 !p-0" aria-label="Zurück" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
              <button className="btn-outline btn-sm h-9" onClick={() => go({ date: today })}>Heute</button>
              <button className="btn-outline btn-sm h-9 w-9 !p-0" aria-label="Weiter" onClick={() => step(1)}><ChevronRight size={16} /></button>
            </div>
          )}
          <Link href="/ai" className="btn-outline hidden h-10 lg:inline-flex"><Sparkles size={16} className="text-ai" /> KI-Planung</Link>
          <button className="btn-primary hidden h-10 lg:inline-flex" onClick={() => openCreate(view === 'day' ? date : date < today && view !== 'month' ? date : today)}>
            <Plus size={16} /> Neuer Termin
          </button>
          {/* phone: round + button like Google Calendar */}
          <button className="fixed bottom-28 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-leaf-dark text-white shadow-lift active:scale-95 lg:hidden"
            aria-label="Neuer Termin" onClick={() => openCreate(view === 'day' ? date : date < today && view !== 'month' ? date : today)}>
            <Plus size={26} />
          </button>
        </header>

        <details className="card mb-4 hidden p-4 lg:block xl:hidden">
          <summary className="cursor-pointer text-sm font-semibold">Kalender & Kategorien ein-/ausblenden</summary>
          <div className="mt-3"><CalendarList calendars={calendars} /></div>
        </details>

        {view === 'week' && (
          <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i))} items={items} today={today} tz={tz}
            conflictKeys={conflictKeys} onOpen={openItem} onCreate={openCreate} />
        )}
        {view === 'day' && (
          <div {...swipe}><TimeGrid days={[date]} items={items} today={today} tz={tz} conflictKeys={conflictKeys} onOpen={openItem} onCreate={openCreate} detailed /></div>
        )}
        {view === 'month' && (
          <MonthView month={date.slice(0, 7)} gridStart={props.rangeFrom} items={items} today={today} tz={tz}
            onDay={d => router.push(`/calendar?view=day&date=${d}`)} onOpen={openItem} />
        )}
        {view === 'agenda' && (
          <AgendaView items={items} tz={tz} today={today} filter={props.filter} from={props.rangeFrom} to={props.rangeTo}
            conflictKeys={conflictKeys} onOpen={openItem} mascot={props.mascot} />
        )}
      </div>
      {dialog && (
        <EventDialog state={dialog} tz={tz} calendars={calendars} reminderDefault={props.reminderDefault}
          onClose={() => setDialog(null)} onEdit={s => setDialog(s)} />
      )}
    </div>
  );
}
