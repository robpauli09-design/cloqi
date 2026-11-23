'use client';

import { addDays, utcToZoned, WEEKDAYS_SHORT_DE } from '@/lib/time';
import { CATEGORY_META, type CalendarItem } from '@/lib/types';

export function MonthView({ month, gridStart, items, today, tz, onDay, onOpen }: {
  month: string; gridStart: string; items: CalendarItem[]; today: string; tz: string;
  onDay: (d: string) => void; onOpen: (i: CalendarItem) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    const s = utcToZoned(i.startAt, tz).date;
    const e = utcToZoned(new Date(Date.parse(i.endAt) - 1), tz).date;
    for (let d = s; d <= e && d <= days[41]; d = addDays(d, 1)) {
      if (d < gridStart) continue;
      byDay.set(d, [...(byDay.get(d) ?? []), i]);
    }
  }
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-paper/60">
        {WEEKDAYS_SHORT_DE.map(w => <div key={w} className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-ink-faint">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map(d => {
          const list = (byDay.get(d) ?? []).filter(i => i.status !== 'missed');
          const inMonth = d.startsWith(month);
          const exams = list.filter(i => i.category === 'pruefung').length;
          const visible = list.filter(i => i.kind !== 'lesson').slice(0, 3);
          const lessons = list.filter(i => i.kind === 'lesson' && i.status === 'active').length;
          return (
            <div key={d} className={`min-h-[104px] border-b border-l border-line p-1.5 first:border-l-0 ${inMonth ? 'bg-white' : 'bg-paper/70'}`}>
              <button onClick={() => onDay(d)} className="flex w-full items-center justify-between" aria-label={`Tag ${d} öffnen`}>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${d === today ? 'bg-leaf-dark text-white' : inMonth ? 'text-ink' : 'text-ink-faint'}`}>{Number(d.slice(8))}</span>
                {list.length > 0 && <span className="text-[10px] font-semibold text-ink-faint">{list.length} Termin{list.length > 1 ? 'e' : ''}</span>}
              </button>
              <div className="mt-1 space-y-0.5">
                {exams > 0 && <span className="chip bg-danger-soft px-1.5 py-0 text-[10px] text-danger">{exams} Prüfung{exams > 1 ? 'en' : ''}</span>}
                {visible.map(i => (
                  <button key={i.key} onClick={() => onOpen(i)} className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] font-medium hover:bg-paper">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.calendarColor && i.allDay ? i.calendarColor : CATEGORY_META[i.category].color }} />
                    <span className={`truncate ${i.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{i.title}</span>
                  </button>
                ))}
                {lessons > 0 && <p className="px-1 text-[10px] text-ink-faint">{lessons} Stunde{lessons > 1 ? 'n' : ''} Unterricht</p>}
                {list.filter(i => i.kind !== 'lesson').length > 3 && (
                  <button onClick={() => onDay(d)} className="px-1 text-[10px] font-semibold text-leaf-dark">+{list.filter(i => i.kind !== 'lesson').length - 3} weitere</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
