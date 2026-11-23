import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, ArrowRight, BookOpen, CalendarClock, Clock3, Dumbbell, Flame, ListTodo, MapPin, School, Sparkles, Trophy } from 'lucide-react';
import { requireReadyUser } from '@/lib/auth';
import { buildDashboard } from '@/lib/insights';
import { getProgress } from '@/lib/stats';
import { formatDateDe, relativeDayDe, utcToZoned, WEEKDAYS_SHORT_DE } from '@/lib/time';
import { CATEGORY_META, TASK_KIND_LABELS, type CalendarItem } from '@/lib/types';
import { Mascot } from '@/components/Mascot';
import { StudyCheck, SuggestionActions } from '@/components/ItemActions';
import { ProgressRing } from '@/components/ui';

export const metadata: Metadata = { title: 'Home' };

function greeting(hour: number) {
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Hey';
  return 'Guten Abend';
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireReadyUser();
  const { welcome } = await searchParams;
  const tz = user.timezone;
  const d = await buildDashboard(user);
  const p = await getProgress(user);
  const now = utcToZoned(new Date(), tz);
  const t = (iso: string) => utcToZoned(iso, tz).time;
  const name = user.name || 'du';
  const goal = p.dailyGoal ? p.todayMinutes / p.dailyGoal : 0;
  const nowIso = new Date().toISOString();

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section className="card relative overflow-hidden bg-gradient-to-br from-white via-white to-leaf-soft">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime/20 blur-2xl" />
        <div className="relative flex flex-col-reverse gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1">
            <p className="eyebrow">{formatDateDe(d.today, { weekday: true, year: true })}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(Number(now.time.slice(0, 2)))}, {name}! 👋</h1>
            <p className="mt-1 text-lg text-ink-soft">{welcome ? 'Schön, dass du da bist! Ich habe deinen Kalender vorbereitet.' : 'Ready für deinen Tag?'}</p>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-leaf/20 bg-white/80 p-4 backdrop-blur">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-leaf" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-leaf-dark">CLOQI Insight</p>
                <p className="mt-0.5 text-sm font-medium text-ink">{d.insight}</p>
              </div>
            </div>
          </div>
          <Mascot name={user.prefs.mascot} variant="bust" size={190} float priority className="mx-auto shrink-0 sm:mx-0" />
        </div>
      </section>

      {/* Day overview */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<School size={18} />} label="Nächste Unterrichtseinheit" value={d.nextLesson ? d.nextLesson.title : '–'}
          hint={d.nextLesson ? `${relativeDayDe(utcToZoned(d.nextLesson.startAt, tz).date, d.today)}, ${t(d.nextLesson.startAt)}${d.nextLesson.location ? ` · ${d.nextLesson.location}` : ''}` : 'Kein Unterricht eingetragen'} />
        <Stat icon={<CalendarClock size={18} />} label="Nächster Termin" value={d.nextEvent ? d.nextEvent.title : '–'}
          hint={d.nextEvent ? `${relativeDayDe(utcToZoned(d.nextEvent.startAt, tz).date, d.today)}, ${t(d.nextEvent.startAt)}` : 'Nichts geplant'} />
        <Stat icon={<BookOpen size={18} />} label="Lernblöcke heute" value={String(d.studyToday.length)}
          hint={`${d.studyToday.filter(s => s.status === 'done').length} erledigt`} />
        <Stat icon={<Dumbbell size={18} />} label="Training heute" value={d.trainingToday.length ? t(d.trainingToday[0].startAt) : '–'}
          hint={d.trainingToday.length ? d.trainingToday[0].title : 'Kein Training'} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* My day */}
        <section className="card card-pad">
          <div className="flex items-center justify-between">
            <h2 className="h2">Mein Tag</h2>
            <Link href="/calendar?view=day" className="btn-ghost btn-sm">Tagesansicht <ArrowRight size={14} /></Link>
          </div>
          {d.items.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
              <Mascot name={user.prefs.mascot} variant="bust" size={110} />
              <p className="font-semibold">Heute ist noch nichts eingetragen.</p>
              <p className="muted">Genieß den freien Tag – oder <Link href="/ai" className="font-semibold text-leaf-dark underline">sag mir</Link>, was ansteht.</p>
            </div>
          ) : (
            (() => {
              // short list: what is still coming (max. 4); the whole day behind "Alle anzeigen"
              const row = (i: CalendarItem) => <TimelineRow key={i.key} item={i} start={i.allDay ? 'Ganzt.' : t(i.startAt)} end={i.allDay ? '' : t(i.endAt)} past={i.endAt < nowIso} />;
              const next = d.items.filter(i => i.endAt >= nowIso || i.allDay).slice(0, 4);
              const hidden = d.items.length - next.length;
              const line = 'relative space-y-2 before:absolute before:bottom-2 before:left-[58px] before:top-2 before:w-px before:bg-line';
              return (
                <>
                  {next.length > 0
                    ? <ol className={`mt-5 ${line}`}>{next.map(row)}</ol>
                    : <p className="mt-4 text-sm text-ink-soft">Für heute ist alles erledigt. 🎉</p>}
                  {hidden > 0 && (
                    <details className="group mt-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-leaf-dark">
                        <span className="group-open:hidden">Alle {d.items.length} anzeigen</span><span className="hidden group-open:inline">Weniger anzeigen</span>
                      </summary>
                      <ol className={`mt-3 ${line}`}>{d.items.map(row)}</ol>
                    </details>
                  )}
                </>
              );
            })()
          )}
          {d.freeToday.length > 0 && (
            <p className="mt-4 rounded-xl bg-leaf-soft px-4 py-3 text-sm text-leaf-dark">
              <Clock3 size={15} className="mr-1.5 inline -translate-y-px" />
              Freie Zeit: {d.freeToday.map(f => `${f.start}–${f.end}`).join(', ')} Uhr – nutze sie für Lernen, Freunde oder Erholung.
            </p>
          )}
        </section>

        <div className="space-y-6">
          {/* Suggestions & conflicts */}
          {(d.suggestions.length > 0 || d.conflicts.length > 0) && (
            <section className="card card-pad">
              <h2 className="h2">Was hat sich verändert?</h2>
              <ul className="mt-4 space-y-3">
                {d.suggestions.map(s => (
                  <li key={s.id} className="rounded-2xl border border-line bg-paper/60 p-4">
                    <p className="text-sm font-medium">{s.message}</p>
                    <div className="mt-3"><SuggestionActions id={s.id} kind={s.kind} /></div>
                  </li>
                ))}
                {d.conflicts.slice(0, 3).map(c => (
                  <li key={`${c.a.key}-${c.b.key}`} className="flex gap-3 rounded-2xl border border-danger/25 bg-danger-soft/60 p-4 text-sm">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
                    <div>
                      <p className="font-semibold text-danger">Terminkonflikt {relativeDayDe(utcToZoned(c.a.startAt, tz).date, d.today)}</p>
                      <p className="text-ink">„{c.a.title}“ ({t(c.a.startAt)}) überschneidet sich mit „{c.b.title}“ ({t(c.b.startAt)}). Welchen möchtest du verschieben?</p>
                      <Link href={`/calendar?view=day&date=${utcToZoned(c.a.startAt, tz).date}`} className="mt-2 inline-flex text-xs font-semibold text-leaf-dark underline">Im Kalender lösen</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Progress */}
          <section className="card card-pad">
            <div className="flex items-center justify-between">
              <h2 className="h2">Mein Fortschritt</h2>
              {p.streak > 0 && <span className="chip bg-warn-soft text-[#a55912]"><Flame size={14} /> {p.streak} {p.streak === 1 ? 'Tag' : 'Tage'} Serie</span>}
            </div>
            <div className="mt-5 flex items-center gap-5">
              <ProgressRing value={goal}>
                <div><p className="font-display text-xl font-semibold tabular">{p.todayMinutes}</p><p className="text-[10px] text-ink-faint">von {p.dailyGoal} Min</p></div>
              </ProgressRing>
              <div className="flex-1 space-y-2 text-sm">
                <Row label="Tagesziel Lernzeit" value={goal >= 1 ? 'Erreicht! 🎉' : `${Math.round(goal * 100)} %`} />
                <Row label="Lernblöcke diese Woche" value={`${p.weekDone} / ${p.weekPlanned}`} />
                <Row label="Offene Aufgaben" value={String(p.openTasks)} />
                <Row label="Erledigte Aufgaben" value={String(p.doneTasks)} />
              </div>
            </div>
            <div className="mt-5 flex h-20 gap-2" aria-label="Lernminuten pro Tag diese Woche">
              {p.weekDays.map((day, i) => {
                const max = Math.max(p.dailyGoal, ...p.weekDays.map(x => x.minutes), 1);
                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1" title={`${day.minutes} Minuten`}>
                    <div className="flex w-full flex-1 items-end rounded-md bg-leaf-soft">
                      <div className="w-full rounded-md bg-leaf transition-all" style={{ height: `${(day.minutes / max) * 100}%` }} />
                    </div>
                    <span className={`text-[10px] font-semibold ${day.date === d.today ? 'text-leaf-dark' : 'text-ink-faint'}`}>{WEEKDAYS_SHORT_DE[i]}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {p.badges.map(b => (
                <span key={b.id} title={b.hint} className={`chip ${b.earned ? 'bg-lime/40 text-leaf-deep' : 'bg-paper text-ink-faint'}`}>
                  <Trophy size={12} /> {b.label}
                </span>
              ))}
            </div>
          </section>

          {/* Open tasks */}
          <section className="card card-pad">
            <div className="flex items-center justify-between">
              <h2 className="h2">Offene Aufgaben</h2>
              <Link href="/learn" className="btn-ghost btn-sm">Learn <ArrowRight size={14} /></Link>
            </div>
            {d.openTasks.length ? (
              <ul className="mt-4 space-y-2">
                {d.openTasks.map(task => (
                  <li key={task.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-danger-soft text-danger"><ListTodo size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{TASK_KIND_LABELS[task.kind]} {task.subject}</p>
                      <p className="text-xs text-ink-soft">{relativeDayDe(utcToZoned(task.dueAt, tz).date, d.today)}, {t(task.dueAt)} Uhr</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted mt-3">Keine offenen Tests oder Aufgaben. 🎉</p>}
          </section>

          {user.prefs.cycleEnabled && (
            <Link href="/cycle" className="card card-pad flex items-center gap-3 hover:shadow-lift">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-freizeit text-white" style={{ background: '#E06A9E' }}>✿</span>
              <span className="flex-1 font-semibold">Cycle öffnen</span><ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-leaf-dark">{icon}<span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">{label}</span></div>
      <p className="mt-2 truncate font-display text-xl font-semibold">{value}</p>
      <p className="truncate text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2"><span className="text-ink-soft">{label}</span><span className="font-semibold tabular">{value}</span></div>;
}

function TimelineRow({ item, start, end, past }: { item: CalendarItem; start: string; end: string; past: boolean }) {
  const m = CATEGORY_META[item.category];
  const cancelled = item.status === 'cancelled';
  return (
    <li className={`relative flex items-center gap-3 ${past ? 'opacity-55' : ''}`}>
      <span className="w-[46px] shrink-0 text-right text-xs font-semibold tabular text-ink-soft">{start}</span>
      <span className="relative z-10 h-3 w-3 shrink-0 rounded-full border-2 border-white shadow" style={{ background: m.color }} />
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: m.soft }}>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${cancelled ? 'line-through' : ''}`} style={{ color: m.text }}>{item.title}{cancelled && ' – entfällt'}</p>
          <p className="truncate text-xs text-ink-soft">
            {end && `${start}–${end}`} · {item.calendarLabel}{item.location && <><MapPin size={11} className="mx-1 inline -translate-y-px" />{item.location}</>}
          </p>
        </div>
        {item.kind === 'study' && <StudyCheck id={item.id} done={item.status === 'done'} />}
      </div>
    </li>
  );
}
