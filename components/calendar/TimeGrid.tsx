'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Bell, Check, MapPin, Repeat } from 'lucide-react';
import { moveItemAction } from '@/app/actions/calendar';
import { minutesToTime, utcToZoned, WEEKDAYS_SHORT_DE, weekdayOf } from '@/lib/time';
import { CATEGORY_META, type CalendarItem } from '@/lib/types';
import { toastResult } from '../Toaster';

interface Props {
  days: string[]; items: CalendarItem[]; today: string; tz: string; conflictKeys: Set<string>;
  onOpen: (i: CalendarItem) => void; onCreate: (date: string, start: string, end: string) => void; detailed?: boolean;
}

interface Placed { item: CalendarItem; top: number; height: number; col: number; cols: number; startMin: number; endMin: number }

const SNAP = 15;

function placeDay(day: string, items: CalendarItem[], tz: string, hourPx: number): Placed[] {
  const timed = items
    .filter(i => !i.allDay)
    .map(i => {
      const s = utcToZoned(i.startAt, tz);
      const e = utcToZoned(i.endAt, tz);
      if (s.date > day || e.date < day || (e.date === day && e.minutes === 0 && s.date < day)) return null;
      const startMin = s.date < day ? 0 : s.minutes;
      const endMin = e.date > day ? 1440 : Math.max(e.minutes, startMin + 15);
      return { item: i, startMin, endMin };
    })
    .filter((x): x is { item: CalendarItem; startMin: number; endMin: number } => x !== null)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // greedy column layout per overlapping cluster
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map(c => c.col)) + 1; cluster.forEach(c => (c.cols = n)); out.push(...cluster); cluster = []; };
  for (const t of timed) {
    if (cluster.length && t.startMin >= clusterEnd) flush();
    const used = new Set(cluster.filter(c => c.endMin > t.startMin).map(c => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...t, col, cols: 1, top: (t.startMin / 60) * hourPx, height: Math.max(((t.endMin - t.startMin) / 60) * hourPx, 20) });
    clusterEnd = Math.max(clusterEnd, t.endMin);
  }
  if (cluster.length) flush();
  return out;
}

export function TimeGrid({ days, items, today, tz, conflictKeys, onOpen, onCreate, detailed = false }: Props) {
  const hourPx = detailed ? 64 : 48;
  const scroller = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ day: string; a: number; b: number } | null>(null);
  const [dropHint, setDropHint] = useState<{ day: string; min: number } | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    const update = () => setNowMin(utcToZoned(new Date(), tz).minutes);
    update();
    const t = setInterval(update, 60000);
    if (scroller.current) scroller.current.scrollTop = 7 * hourPx - 8;
    return () => clearInterval(t);
  }, [tz, hourPx]);

  const placed = useMemo(() => Object.fromEntries(days.map(d => [d, placeDay(d, items, tz, hourPx)])), [days, items, tz, hourPx]);
  const allDay = (d: string) => items.filter(i => i.allDay && utcToZoned(i.startAt, tz).date <= d && utcToZoned(new Date(Date.parse(i.endAt) - 1), tz).date >= d);
  const minuteAt = (e: React.MouseEvent | React.DragEvent, el: HTMLElement) =>
    Math.max(0, Math.min(1440 - SNAP, Math.round(((e.clientY - el.getBoundingClientRect().top) / hourPx) * 60 / SNAP) * SNAP));

  const editable = (i: CalendarItem) => (i.kind === 'study' && i.status !== 'done') || (i.kind === 'event' && !i.readOnly && i.source !== 'cycle');

  const free = (day: string) => {
    if (!detailed) return [];
    const busy = placed[day].filter(p => p.item.status !== 'cancelled').map(p => [p.startMin, p.endMin] as const).sort((a, b) => a[0] - b[0]);
    const gaps: [number, number][] = [];
    let cursor = 7 * 60;
    const nowCut = day === today && nowMin !== null ? Math.ceil(nowMin / SNAP) * SNAP : 0;
    cursor = Math.max(cursor, nowCut);
    for (const [s, e] of busy) { if (s - cursor >= 45) gaps.push([cursor, s]); cursor = Math.max(cursor, e); }
    if (22 * 60 - cursor >= 45) gaps.push([cursor, 22 * 60]);
    return gaps;
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <div style={{ minWidth: days.length > 1 ? 760 : undefined }}>
          {/* header */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
            <div />
            {days.map(d => {
              const isToday = d === today;
              return (
                <div key={d} className="border-l border-line px-2 py-2 text-center">
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-leaf-dark' : 'text-ink-faint'}`}>{WEEKDAYS_SHORT_DE[weekdayOf(d) - 1]}</p>
                  <p className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full font-display text-lg font-semibold ${isToday ? 'bg-leaf-dark text-white' : ''}`}>{Number(d.slice(8))}</p>
                  <div className="mt-1 space-y-1">
                    {allDay(d).map(i => (
                      <button key={i.key} onClick={() => onOpen(i)} className="block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold"
                        style={{ background: i.calendarColor ? `${i.calendarColor}22` : CATEGORY_META[i.category].soft, color: CATEGORY_META[i.category].text }}>
                        {i.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* grid */}
          <div ref={scroller} className="relative max-h-[68vh] overflow-y-auto scrollbar-thin">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))`, height: 24 * hourPx }}>
              <div className="relative">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] font-semibold tabular text-ink-faint" style={{ top: h * hourPx }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>
                ))}
              </div>
              {days.map(d => (
                <div
                  key={d}
                  className={`relative border-l border-line ${d === today ? 'bg-leaf-soft/30' : ''}`}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourPx - 1}px, #EDEBE3 ${hourPx - 1}px, #EDEBE3 ${hourPx}px)` }}
                  onMouseDown={e => {
                    if (e.button !== 0 || e.target !== e.currentTarget) return;
                    const m = minuteAt(e, e.currentTarget);
                    setSelection({ day: d, a: m, b: m + 60 });
                  }}
                  onMouseMove={e => {
                    if (!selection || selection.day !== d || e.buttons !== 1) return;
                    const m = minuteAt(e, e.currentTarget) + SNAP;
                    setSelection(s => s && { ...s, b: Math.max(s.a + SNAP, m) });
                  }}
                  onMouseUp={() => {
                    if (!selection) return;
                    onCreate(selection.day, minutesToTime(selection.a), minutesToTime(Math.min(selection.b, 1439)));
                    setSelection(null);
                  }}
                  onDragOver={e => { e.preventDefault(); setDropHint({ day: d, min: minuteAt(e, e.currentTarget) }); }}
                  onDragLeave={() => setDropHint(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setDropHint(null);
                    const data = JSON.parse(e.dataTransfer.getData('application/cloqi') || 'null') as { kind: 'event' | 'study'; id: string; occ: string | null; offset: number } | null;
                    if (!data) return;
                    const target = Math.max(0, minuteAt(e, e.currentTarget) - Math.round(data.offset / SNAP) * SNAP);
                    start(async () => toastResult(await moveItemAction(data.kind, data.id, data.occ, d, minutesToTime(target))));
                  }}
                >
                  {free(d).map(([s, e]) => (
                    <button key={s} onClick={() => onCreate(d, minutesToTime(s), minutesToTime(Math.min(s + 60, e)))}
                      className="absolute inset-x-2 rounded-xl border-2 border-dashed border-leaf/30 text-xs font-semibold text-leaf-dark/70 hover:border-leaf hover:bg-leaf-soft/60"
                      style={{ top: (s / 60) * hourPx + 2, height: ((e - s) / 60) * hourPx - 4 }}>
                      Frei · {minutesToTime(s)}–{minutesToTime(e)}
                    </button>
                  ))}

                  {placed[d].map(p => <ItemCard key={p.item.key} p={p} tz={tz} conflict={conflictKeys.has(p.item.key)} detailed={detailed}
                    draggable={editable(p.item)} onOpen={onOpen} hourPx={hourPx} />)}

                  {selection?.day === d && (
                    <div className="pointer-events-none absolute inset-x-1 z-20 rounded-lg border-2 border-leaf bg-leaf/20 px-2 py-1 text-xs font-semibold text-leaf-deep"
                      style={{ top: (selection.a / 60) * hourPx, height: ((selection.b - selection.a) / 60) * hourPx }}>
                      {minutesToTime(selection.a)}–{minutesToTime(selection.b)}
                    </div>
                  )}
                  {dropHint?.day === d && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-dashed border-leaf-dark" style={{ top: (dropHint.min / 60) * hourPx }}>
                      <span className="ml-1 rounded bg-leaf-dark px-1 text-[10px] font-bold text-white">{minutesToTime(dropHint.min)}</span>
                    </div>
                  )}
                  {d === today && nowMin !== null && (
                    <div className="pointer-events-none absolute inset-x-0 z-30" style={{ top: (nowMin / 60) * hourPx }} aria-label="Aktuelle Uhrzeit">
                      <div className="relative h-0.5 bg-danger/80"><span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-danger" /></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="hidden border-t border-line px-4 py-2 text-[11px] text-ink-faint sm:block">
        Tipp: Zeitraum aufziehen, um einen Termin zu erstellen · Termine und Lernblöcke per Drag-and-drop verschieben
      </p>
    </div>
  );
}

function ItemCard({ p, tz, conflict, detailed, draggable, onOpen, hourPx }: {
  p: Placed; tz: string; conflict: boolean; detailed: boolean; draggable: boolean; onOpen: (i: CalendarItem) => void; hourPx: number;
}) {
  const i = p.item;
  const m = CATEGORY_META[i.category];
  const cancelled = i.status === 'cancelled';
  const done = i.status === 'done';
  const small = p.height < 36;
  const duration = p.endMin - p.startMin;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={e => {
        const offset = ((e.clientY - e.currentTarget.getBoundingClientRect().top) / hourPx) * 60;
        e.dataTransfer.setData('application/cloqi', JSON.stringify({ kind: i.kind === 'study' ? 'study' : 'event', id: i.id, occ: i.occurrenceDate, offset }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(i)}
      title={`${i.title} · ${utcToZoned(i.startAt, tz).time}–${utcToZoned(i.endAt, tz).time}`}
      className={`absolute z-10 overflow-hidden rounded-lg border-l-[3px] px-1.5 text-left shadow-sm transition hover:z-20 hover:shadow-lift
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${conflict ? 'ring-2 ring-danger' : ''} ${cancelled ? 'opacity-50' : ''}
        ${i.kind === 'deadline' ? 'border-dashed' : ''}`}
      style={{
        top: p.top + 1, height: p.height - 2,
        left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`,
        background: m.soft, borderLeftColor: i.calendarColor && i.kind === 'event' ? i.calendarColor : m.color, color: m.text,
      }}
    >
      <div className={`flex items-start gap-1 ${small ? 'py-0' : 'py-1'}`}>
        {done && <Check size={12} className="mt-0.5 shrink-0" strokeWidth={3} />}
        {conflict && <AlertTriangle size={12} className="mt-0.5 shrink-0 text-danger" />}
        <span className={`min-w-0 truncate text-[11px] font-bold leading-tight ${cancelled ? 'line-through' : ''}`}>{i.title}</span>
      </div>
      {!small && (
        <p className="truncate text-[10px] font-medium opacity-80">
          {utcToZoned(i.startAt, tz).time}–{utcToZoned(i.endAt, tz).time}{i.location && !detailed ? ` · ${i.location}` : ''}
        </p>
      )}
      {detailed && p.height > 60 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium opacity-80">
          <span>{duration} Min</span>
          <span>· {m.label}</span>
          <span>· {i.calendarLabel}</span>
          {i.location && <span className="inline-flex items-center gap-0.5"><MapPin size={10} />{i.location}</span>}
          {i.reminderMinutes !== null && i.kind !== 'lesson' && <span className="inline-flex items-center gap-0.5"><Bell size={10} />{i.reminderMinutes} Min vorher</span>}
          {i.recurring && <Repeat size={10} />}
        </div>
      )}
    </button>
  );
}
