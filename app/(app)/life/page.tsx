import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { busyIntervals, dayRange, getCalendarItems } from '@/lib/calendar';
import { listEvents } from '@/lib/repo';
import { describeRule } from '@/lib/recurrence';
import { freeSlots } from '@/lib/scheduler';
import { addDays, relativeDayDe, todayIn, utcToZoned, weekdayOf, WEEKDAYS_DE } from '@/lib/time';
import { CATEGORY_META } from '@/lib/types';
import { Mascot } from '@/components/Mascot';
import { LifeForms, RoutineDelete } from './LifeForms';

export const metadata: Metadata = { title: 'Life' };

const LIFE = new Set(['training', 'arbeit', 'freizeit', 'privat']);

export default async function LifePage() {
  const user = await requireReadyUser();
  const tz = user.timezone;
  const today = todayIn(tz);
  const now = new Date();
  const horizon = dayRange(addDays(today, 14), tz).from;
  const routines = listEvents(user.id, now.toISOString(), horizon)
    .filter(e => e.recurrenceFreq && LIFE.has(e.category) && !['webuntis', 'ics'].includes(e.source));
  const upcoming = getCalendarItems(user, now.toISOString(), horizon)
    .filter(i => i.kind === 'event' && LIFE.has(i.category) && !i.recurring && i.status === 'active').slice(0, 10);

  const weekEnd = addDays(today, 7 - weekdayOf(today));
  const free: { day: string; slots: string[] }[] = [];
  for (let d = today; d <= weekEnd; d = addDays(d, 1)) {
    const { from, to } = dayRange(d, tz);
    const slots = freeSlots(d, tz, busyIntervals(getCalendarItems(user, from, to, { includeHidden: true })),
      { ...user.prefs, studyStart: '14:00', studyEnd: '22:00', weekendStart: '09:00', weekendEnd: '22:00', studyOnSunday: true }, now)
      .filter(s => s.end - s.start >= 90 * 60000)
      .map(s => `${utcToZoned(new Date(s.start), tz).time}–${utcToZoned(new Date(s.end), tz).time}`);
    if (slots.length) free.push({ day: d, slots });
  }

  return (
    <div className="space-y-6">
      <header className="card relative overflow-hidden bg-gradient-to-br from-white to-[#FBE5EF]/70 p-6 sm:p-8">
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="eyebrow">Life</p>
            <h1 className="h1">Freizeit ist genauso wichtig wie Lernen.</h1>
            <p className="muted mt-2 max-w-xl">Trag Training, Arbeit, Freunde und Erholung ein. CLOQI plant Lernzeit drumherum – und füllt nicht jede freie Minute.</p>
          </div>
          <Mascot name={user.prefs.mascot} variant="bust" size={140} float />
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <LifeForms />
          <section className="card card-pad">
            <h2 className="h2">Deine Routinen</h2>
            {routines.length === 0 ? <p className="muted mt-2">Noch keine Routinen. Zum Beispiel: Training Di + Do 17:00–18:30.</p> : (
              <ul className="mt-4 divide-y divide-line">
                {routines.map(r => {
                  const s = utcToZoned(r.startAt, tz);
                  const m = CATEGORY_META[r.category];
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <span className="h-10 w-1.5 rounded-full" style={{ background: m.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.title}</p>
                        <p className="text-xs text-ink-soft">
                          {describeRule({ freq: r.recurrenceFreq!, interval: r.recurrenceInterval })}, {WEEKDAYS_DE[s.weekday - 1]} {s.time}–{utcToZoned(r.endAt, tz).time}
                          {r.recurrenceUntil ? ` · bis ${r.recurrenceUntil.split('-').reverse().join('.')}` : ''} · {m.label}
                        </p>
                      </div>
                      <RoutineDelete id={r.id} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card card-pad">
            <h2 className="h2">Freie Zeit diese Woche</h2>
            <p className="muted mt-1">Mindestens 1,5 Stunden am Stück – perfekt für Freunde oder Erholung.</p>
            {free.length === 0 ? <p className="mt-3 text-sm">Diese Woche ist ziemlich voll. Plan dir bewusst eine Pause ein!</p> : (
              <ul className="mt-4 space-y-2">
                {free.map(f => (
                  <li key={f.day} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-28 font-semibold">{relativeDayDe(f.day, today)}</span>
                    {f.slots.map(s => <span key={s} className="chip bg-leaf-soft text-leaf-dark">{s}</span>)}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card card-pad">
            <h2 className="h2">Demnächst privat</h2>
            {upcoming.length === 0 ? <p className="muted mt-2">Keine einmaligen privaten Termine in den nächsten zwei Wochen.</p> : (
              <ul className="mt-4 space-y-2">
                {upcoming.map(i => (
                  <li key={i.key} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[i.category].color }} />
                    <span className="w-28 shrink-0 font-semibold">{relativeDayDe(utcToZoned(i.startAt, tz).date, today)}</span>
                    <span className="tabular text-ink-soft">{i.allDay ? 'ganztägig' : utcToZoned(i.startAt, tz).time}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
