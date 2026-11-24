'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock, Check, ChevronDown, Dumbbell, Flame, History, Lightbulb, Loader2, Pencil, Play, Plus, Search, Timer, Trash2, Trophy, X,
} from 'lucide-react';
import {
  deleteTemplateAction, deleteWorkoutAction, finishWorkoutAction, lastSetsAction, saveTemplateAction, saveWorkoutAction, scheduleTemplateAction, startWorkoutAction,
} from '@/app/actions/sport';
import { EXERCISES, MUSCLE_GROUPS, setLabel, volume, type Exercise, type WorkoutExercise, type WorkoutSet } from '@/lib/sport-data';
import type { ExerciseProgress, WeekStats, Workout, WorkoutSummary, WorkoutTemplate } from '@/lib/sport';
import { formatDateDe, utcToZoned } from '@/lib/time';
import { Mascot, type MascotName } from '@/components/Mascot';
import { toast, toastResult } from '@/components/Toaster';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
type Last = Record<string, WorkoutSet[]>;

export function SportApp(props: {
  mascot: MascotName; tz: string; templates: WorkoutTemplate[]; active: Workout | null; history: Workout[];
  progress: ExerciseProgress[]; week: WeekStats; hints: string[]; last: Last;
}) {
  const { templates, active, week } = props;
  const router = useRouter();
  const [editing, setEditing] = useState<WorkoutTemplate | 'new' | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null); // survives the page refresh after finishing
  const [pending, start] = useTransition();
  const begin = (templateId: string | null) => start(async () => {
    const r = await startWorkoutAction(templateId);
    if (!r.ok) toastResult(r); else router.refresh();
  });

  return (
    <div className="space-y-6">
      <header className="card relative overflow-hidden bg-gradient-to-br from-white to-[#DDF3F1]/80 p-6 sm:p-8">
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="eyebrow">Sport</p>
            <h1 className="h1">Trainieren – und die Schule läuft trotzdem.</h1>
            <p className="muted mt-2 max-w-xl">Plan deine Trainings fix ein, schreib Sätze mit und sieh deinen Fortschritt. CLOQI plant Lernzeit automatisch drumherum.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="chip bg-white/80 text-ink"><Dumbbell size={14} className="text-[#13706A]" /> {week.workouts} Training{week.workouts === 1 ? '' : 's'} diese Woche</span>
              {week.minutes > 0 && <span className="chip bg-white/80 text-ink"><Timer size={14} className="text-[#13706A]" /> {week.minutes} Min</span>}
              {week.streakWeeks > 0 && <span className="chip bg-white/80 text-ink"><Flame size={14} className="text-[#F08C2E]" /> {week.streakWeeks} Woche{week.streakWeeks === 1 ? '' : 'n'} in Folge</span>}
            </div>
          </div>
          <Mascot name={props.mascot} variant="bust" size={140} />
        </div>
      </header>

      {props.hints.length > 0 && (
        <div className="space-y-2">
          {props.hints.map(h => (
            <p key={h} className="flex items-start gap-2.5 rounded-2xl border border-leaf/20 bg-white/80 px-4 py-3 text-sm"><Lightbulb size={16} className="mt-0.5 shrink-0 text-leaf" />{h}</p>
          ))}
        </div>
      )}

      {summary ? <SummaryCard summary={summary} onClose={() => setSummary(null)} />
        : active ? <ActiveWorkout key={active.id} workout={active} last={props.last} onDone={() => router.refresh()} onFinished={s => { setSummary(s); router.refresh(); }} /> : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <section className="card card-pad">
              <div className="flex items-center justify-between gap-3">
                <h2 className="h2">Training starten</h2>
                <button className="btn-outline btn-sm" disabled={pending} onClick={() => begin(null)}><Play size={14} /> Leeres Training</button>
              </div>
              {templates.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-paper p-4 text-sm text-ink-soft">
                  Leg eine <b>Vorlage</b> an (z. B. „Oberkörper“ oder „Laufen“), plan sie an fixen Tagen ein – CLOQI hält dir die Zeit frei und plant Lernen drumherum.
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {templates.map(t => (
                    <li key={t.id} className="rounded-2xl border border-line p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{t.name}</p>
                          <p className="truncate text-xs text-ink-soft">{t.exercises.map(e => e.name).join(' · ') || 'Noch keine Übungen'}</p>
                          {t.schedule && (
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#13706A]">
                              <CalendarClock size={13} /> {t.schedule.weekdays.map(d => DAYS[d - 1]).join(' + ')} · {t.schedule.time} · {t.schedule.minutes} Min im Kalender
                            </p>
                          )}
                        </div>
                        <button className="btn-ghost btn-sm !px-2" aria-label={`${t.name} bearbeiten`} onClick={() => setEditing(t)}><Pencil size={15} /></button>
                        <button className="btn-primary btn-sm" disabled={pending} onClick={() => begin(t.id)}><Play size={14} /> Start</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn-ghost btn-sm mt-3" onClick={() => setEditing('new')}><Plus size={14} /> Neue Vorlage</button>
            </section>
            <HistoryList history={props.history} tz={props.tz} />
          </div>
          <ProgressList progress={props.progress} />
        </div>
      )}

      {editing && <TemplateEditor template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ live workout

function ActiveWorkout({ workout, last: initialLast, onDone, onFinished }: { workout: Workout; last: Last; onDone(): void; onFinished(s: WorkoutSummary): void }) {
  const [name, setName] = useState(workout.name);
  const [ex, setEx] = useState<WorkoutExercise[]>(workout.exercises);
  const [last, setLast] = useState<Last>(initialLast);
  const [picker, setPicker] = useState(false);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // autosave (nothing is lost when the page is closed mid-workout)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { void saveWorkoutAction(workout.id, { name, exercises: ex }); }, 800);
    return () => clearTimeout(t);
  }, [ex, name, workout.id]);
  const restLeft = rest ? Math.min(rest.total, Math.max(0, Math.ceil((rest.until - now) / 1000))) : 0;
  useEffect(() => { if (rest && restLeft === 0) { setRest(null); try { navigator.vibrate?.(200); } catch { /* not supported */ } } }, [rest, restLeft]);

  const elapsed = Math.floor((now - Date.parse(workout.startedAt)) / 1000);
  const update = (i: number, fn: (e: WorkoutExercise) => WorkoutExercise) => setEx(xs => xs.map((e, k) => (k === i ? fn(e) : e)));
  const setField = (i: number, s: number, patch: Partial<WorkoutSet>) => update(i, e => ({ ...e, sets: e.sets.map((x, k) => (k === s ? { ...x, ...patch } : x)) }));
  const toggle = (i: number, s: number) => {
    const set = ex[i].sets[s];
    setField(i, s, { done: !set.done });
    if (!set.done) setRest({ until: Date.now() + 90_000, total: 90 }); // rest timer like Strong
  };
  const addExercise = async (e: Exercise) => {
    setPicker(false);
    const prev = last[e.id] ?? (await lastSetsAction([e.id]))[e.id];
    if (prev) setLast(l => ({ ...l, [e.id]: prev }));
    const sets = (prev?.length ? prev : [{}, {}, {}]).map(s => ({ kg: s.kg ?? null, reps: s.reps ?? null, sec: s.sec ?? null, km: s.km ?? null, done: false }));
    setEx(xs => [...xs, { id: e.id, name: e.name, kind: e.kind, sets }]);
  };
  const doneSets = ex.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const finish = () => start(async () => {
    const r = await finishWorkoutAction(workout.id, { exercises: ex });
    if (!r.ok) return toastResult(r);
    onFinished(r.data!);
  });
  const discard = () => {
    if (!window.confirm('Training verwerfen? Die Sätze werden nicht gespeichert.')) return;
    start(async () => { const r = await deleteWorkoutAction(workout.id); toastResult(r); onDone(); });
  };

  return (
    <section className="card card-pad">
      <div className="flex flex-wrap items-center gap-3">
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} aria-label="Name des Trainings" className="min-w-0 flex-1 bg-transparent font-display text-2xl font-semibold outline-none" />
        <span className="chip bg-paper font-mono text-ink"><Timer size={14} /> {Math.floor(elapsed / 3600) ? `${Math.floor(elapsed / 3600)}:` : ''}{String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
        <button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={discard}><Trash2 size={14} /> Verwerfen</button>
        <button className="btn-primary" disabled={pending || !doneSets} onClick={finish}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Beenden</button>
      </div>

      {rest && (
        <div className="sticky top-3 z-10 mt-4 flex items-center gap-3 rounded-2xl bg-leaf-deep px-4 py-3 text-white shadow-lift" role="timer" aria-live="polite">
          <Timer size={18} className="text-lime" />
          <span className="font-semibold">Pause</span>
          <span className="font-mono text-lg">{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-lime transition-all" style={{ width: `${(restLeft / rest.total) * 100}%` }} /></div>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-white/10" onClick={() => setRest(r => r && { until: r.until - 15_000, total: r.total })}>−15</button>
          <button className="rounded-lg px-2 py-1 text-sm hover:bg-white/10" onClick={() => setRest(r => r && { until: r.until + 15_000, total: r.total + 15 })}>+15</button>
          <button aria-label="Pause beenden" className="rounded-lg p-1 hover:bg-white/10" onClick={() => setRest(null)}><X size={16} /></button>
        </div>
      )}

      <div className="mt-5 space-y-5">
        {ex.map((e, i) => (
          <div key={`${e.id}-${i}`} className="rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2">
              <p className="flex-1 font-semibold">{e.name}</p>
              <button className="rounded-lg p-1.5 text-ink-faint hover:bg-paper hover:text-danger" aria-label={`${e.name} entfernen`} onClick={() => setEx(xs => xs.filter((_, k) => k !== i))}><X size={15} /></button>
            </div>
            {last[e.id]?.length ? <p className="text-xs text-ink-faint">Letztes Mal: {last[e.id].map(s => setLabel(e.kind, s)).join(' · ')}</p> : null}
            <table className="mt-3 w-full max-w-md text-sm">
              <thead><tr className="text-left text-xs text-ink-faint">
                <th className="w-10 pb-1 font-semibold">Satz</th>
                {e.kind === 'weight' && <><th className="pb-1 font-semibold">kg</th><th className="pb-1 font-semibold">Wdh.</th></>}
                {e.kind === 'body' && <><th className="pb-1 font-semibold">Wdh.</th><th className="pb-1 font-semibold">+ kg</th></>}
                {e.kind === 'time' && <th className="pb-1 font-semibold">Sekunden</th>}
                {e.kind === 'cardio' && <><th className="pb-1 font-semibold">Minuten</th><th className="pb-1 font-semibold">km</th></>}
                <th className="w-10" />
              </tr></thead>
              <tbody>
                {e.sets.map((s, k) => (
                  <tr key={k} className={s.done ? 'bg-leaf-soft/70' : ''}>
                    <td className="py-1 pl-1 font-semibold text-ink-soft">{k + 1}</td>
                    {e.kind === 'weight' && <><td className="py-1 pr-2"><Num v={s.kg} on={v => setField(i, k, { kg: v })} label="kg" step={2.5} /></td><td className="py-1 pr-2"><Num v={s.reps} on={v => setField(i, k, { reps: v })} label="Wiederholungen" /></td></>}
                    {e.kind === 'body' && <><td className="py-1 pr-2"><Num v={s.reps} on={v => setField(i, k, { reps: v })} label="Wiederholungen" /></td><td className="py-1 pr-2"><Num v={s.kg} on={v => setField(i, k, { kg: v })} label="Zusatzgewicht" step={2.5} /></td></>}
                    {e.kind === 'time' && <td className="py-1 pr-2"><Num v={s.sec} on={v => setField(i, k, { sec: v })} label="Sekunden" step={5} /></td>}
                    {e.kind === 'cardio' && <><td className="py-1 pr-2"><Num v={s.sec ? Math.round(s.sec / 60) : null} on={v => setField(i, k, { sec: v === null ? null : v * 60 })} label="Minuten" /></td><td className="py-1 pr-2"><Num v={s.km} on={v => setField(i, k, { km: v })} label="Kilometer" step={0.1} /></td></>}
                    <td className="py-1 text-right">
                      <button onClick={() => toggle(i, k)} aria-label={`Satz ${k + 1} ${s.done ? 'nicht erledigt' : 'erledigt'}`} aria-pressed={!!s.done}
                        className={`grid h-9 w-9 place-items-center rounded-xl border transition ${s.done ? 'border-leaf bg-leaf text-white' : 'border-line text-ink-faint hover:border-leaf'}`}><Check size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost btn-sm" onClick={() => update(i, x => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? {}), done: false }] }))}><Plus size={14} /> Satz</button>
              {e.sets.length > 1 && <button className="btn-ghost btn-sm text-ink-soft" onClick={() => update(i, x => ({ ...x, sets: x.sets.slice(0, -1) }))}>Letzten entfernen</button>}
            </div>
          </div>
        ))}
      </div>
      <button className="btn-outline mt-5 w-full justify-center" onClick={() => setPicker(true)}><Plus size={16} /> Übung hinzufügen</button>
      {picker && <ExercisePicker onPick={addExercise} onClose={() => setPicker(false)} />}
    </section>
  );
}


function SummaryCard({ summary, onClose }: { summary: WorkoutSummary; onClose(): void }) {
  return (
    <section className="card card-pad mx-auto max-w-xl text-center">
      <Trophy size={40} className="mx-auto text-[#F08C2E]" />
      <h2 className="h1 mt-3">Stark, Training erledigt!</h2>
      <p className="muted mt-1">{summary.minutes} Min · {summary.sets} {summary.sets === 1 ? 'Satz' : 'Sätze'}{summary.volume ? ` · ${summary.volume.toLocaleString('de-AT')} kg bewegt` : ''}</p>
      {summary.records.length > 0 && (
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
          {summary.records.map(r => <li key={r.name} className="flex items-center gap-2 rounded-xl bg-[#FDEBD8] px-3 py-2 text-sm"><Trophy size={15} className="text-[#A55912]" /><b>{r.name}</b>: neue Bestleistung {r.label}</li>)}
        </ul>
      )}
      <button className="btn-primary mt-6" onClick={onClose}>Fertig</button>
    </section>
  );
}

function Num({ v, on, label, step = 1 }: { v: number | null | undefined; on(v: number | null): void; label: string; step?: number }) {
  return (
    <input type="number" inputMode="decimal" min={0} step={step} value={v ?? ''} aria-label={label}
      onChange={e => on(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
      className="input h-9 w-full max-w-[110px] px-2.5 py-1 text-center" />
  );
}

// ------------------------------------------------------------------ exercise picker

function ExercisePicker({ onPick, onClose }: { onPick(e: Exercise): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('');
  const custom = q.trim().length > 1 && !EXERCISES.some(e => e.name.toLowerCase() === q.trim().toLowerCase());
  const list = useMemo(() => EXERCISES.filter(e => (!group || e.group === group) && e.name.toLowerCase().includes(q.trim().toLowerCase())), [q, group]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card flex max-h-[80vh] w-full max-w-md flex-col p-4" role="dialog" aria-label="Übung wählen">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2">
            <Search size={16} className="text-ink-faint" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Übung suchen" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <button className="rounded-full p-2 text-ink-faint hover:bg-paper" aria-label="Schließen" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['', ...MUSCLE_GROUPS].map(g => (
            <button key={g || 'alle'} onClick={() => setGroup(g)} className={`rounded-full px-3 py-1 text-xs font-semibold ${group === g ? 'bg-leaf-dark text-white' : 'bg-paper text-ink-soft'}`}>{g || 'Alle'}</button>
          ))}
        </div>
        <ul className="mt-3 flex-1 overflow-y-auto">
          {custom && <li><button className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-leaf-dark hover:bg-paper" onClick={() => onPick({ id: `custom-${q.trim().toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').slice(0, 30)}`, name: q.trim().slice(0, 60), group: 'Eigene', kind: 'weight' })}>+ „{q.trim()}“ als eigene Übung</button></li>}
          {list.map(e => (
            <li key={e.id}><button className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => onPick(e)}>
              <span>{e.name}</span><span className="text-xs text-ink-faint">{e.group}</span>
            </button></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ templates

function TemplateEditor({ template, onClose }: { template: WorkoutTemplate | null; onClose(): void }) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? '');
  const [ex, setEx] = useState<WorkoutExercise[]>(template?.exercises ?? []);
  const [picker, setPicker] = useState(false);
  const [days, setDays] = useState<number[]>(template?.schedule?.weekdays ?? []);
  const [time, setTime] = useState(template?.schedule?.time ?? '17:00');
  const [minutes, setMinutes] = useState(template?.schedule?.minutes ?? 60);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveTemplateAction({ id: template?.id ?? null, name, exercises: ex });
    if (!r.ok) return toastResult(r);
    const before = template?.schedule;
    const changed = JSON.stringify(before ?? null) !== JSON.stringify(days.length ? { weekdays: [...days].sort(), time, minutes } : null);
    if (changed) toastResult(await scheduleTemplateAction(r.data!, days.length ? { weekdays: days, time, minutes } : null));
    else toast('Vorlage gespeichert.');
    router.refresh();
    onClose();
  });
  const remove = () => {
    if (!template || !window.confirm(`„${template.name}“ löschen? Die Termine im Kalender werden auch entfernt.`)) return;
    start(async () => { toastResult(await deleteTemplateAction(template.id)); router.refresh(); onClose(); });
  };
  const setCount = (i: number, n: number) => setEx(xs => xs.map((e, k) => (k === i ? { ...e, sets: Array.from({ length: n }, (_, j) => e.sets[j] ?? e.sets[e.sets.length - 1] ?? {}) } : e)));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" role="dialog" aria-label="Vorlage">
        <div className="flex items-center justify-between">
          <h2 className="h2">{template ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
          <button className="rounded-full p-2 text-ink-faint hover:bg-paper" aria-label="Schließen" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="label mt-4" htmlFor="tpl-name">Name</label>
        <input id="tpl-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} className="input" placeholder="z. B. Oberkörper, Beine, Laufen" autoFocus={!template} />

        <p className="label mt-5">Übungen</p>
        <ul className="space-y-2">
          {ex.map((e, i) => (
            <li key={`${e.id}-${i}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
              <label className="flex items-center gap-1 text-xs text-ink-soft">Sätze
                <input type="number" min={1} max={10} value={e.sets.length || 1} onChange={v => setCount(i, Math.min(10, Math.max(1, Number(v.target.value) || 1)))} className="input h-8 w-14 px-2 py-0 text-center" />
              </label>
              <button className="rounded-lg p-1 text-ink-faint hover:text-danger" aria-label={`${e.name} entfernen`} onClick={() => setEx(xs => xs.filter((_, k) => k !== i))}><X size={14} /></button>
            </li>
          ))}
        </ul>
        <button className="btn-ghost btn-sm mt-2" onClick={() => setPicker(true)}><Plus size={14} /> Übung hinzufügen</button>

        <div className="mt-5 rounded-2xl bg-paper p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock size={15} className="text-[#13706A]" /> Fix im Kalender einplanen</p>
          <p className="mt-0.5 text-xs text-ink-soft">CLOQI hält dir die Zeit frei und plant Lernblöcke automatisch drumherum.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={d} type="button" aria-pressed={days.includes(i + 1)} onClick={() => setDays(ds => (ds.includes(i + 1) ? ds.filter(x => x !== i + 1) : [...ds, i + 1]))}
                className={`grid h-9 w-10 place-items-center rounded-xl border text-sm font-semibold transition ${days.includes(i + 1) ? 'border-leaf bg-leaf-soft text-leaf-dark' : 'border-line bg-white text-ink-soft'}`}>{d}</button>
            ))}
          </div>
          {days.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="tpl-time">Uhrzeit</label><input id="tpl-time" type="time" value={time} onChange={e => setTime(e.target.value)} className="input" /></div>
              <div><label className="label" htmlFor="tpl-min">Dauer (Minuten)</label><input id="tpl-min" type="number" min={15} max={300} step={5} value={minutes} onChange={e => setMinutes(Number(e.target.value) || 60)} className="input" /></div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2">
          {template && <button className="btn-ghost text-danger" disabled={pending} onClick={remove}><Trash2 size={15} /> Löschen</button>}
          <span className="flex-1" />
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" disabled={pending || !name.trim()} onClick={save}>{pending ? <Loader2 size={15} className="animate-spin" /> : null} Speichern</button>
        </div>
        {picker && <ExercisePicker onPick={e => { setEx(xs => [...xs, { id: e.id, name: e.name, kind: e.kind, sets: [{}, {}, {}] }]); setPicker(false); }} onClose={() => setPicker(false)} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ history & progress

function HistoryList({ history, tz }: { history: Workout[]; tz: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const remove = useCallback((id: string) => {
    if (!window.confirm('Dieses Training aus dem Verlauf löschen?')) return;
    start(async () => { toastResult(await deleteWorkoutAction(id)); router.refresh(); });
  }, [router]);
  return (
    <section className="card card-pad">
      <h2 className="h2 flex items-center gap-2"><History size={18} className="text-ink-soft" /> Verlauf</h2>
      {history.length === 0 ? <p className="muted mt-2">Noch keine Trainings. Nach dem ersten Training siehst du hier alles mit Datum, Dauer und Sätzen.</p> : (
        <ul className="mt-3 divide-y divide-line">
          {history.map(w => {
            const z = utcToZoned(w.finishedAt!, tz);
            const mins = Math.max(1, Math.round((Date.parse(w.finishedAt!) - Date.parse(w.startedAt)) / 60000));
            const v = volume(w.exercises);
            return (
              <li key={w.id} className="py-3">
                <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(o => (o === w.id ? null : w.id))} aria-expanded={open === w.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{w.name}</span>
                    <span className="block text-xs text-ink-soft">{formatDateDe(z.date, { weekday: true })} · {mins} Min · {w.exercises.length} {w.exercises.length === 1 ? 'Übung' : 'Übungen'}{v ? ` · ${v.toLocaleString('de-AT')} kg` : ''}</span>
                  </span>
                  <ChevronDown size={16} className={`text-ink-faint transition ${open === w.id ? 'rotate-180' : ''}`} />
                </button>
                {open === w.id && (
                  <div className="mt-2 space-y-1 rounded-xl bg-paper p-3 text-sm">
                    {w.exercises.map((e, i) => <p key={i}><b>{e.name}:</b> {e.sets.map(s => setLabel(e.kind, s)).join(' · ')}</p>)}
                    <button className="btn-ghost btn-sm mt-1 text-danger" disabled={pending} onClick={() => remove(w.id)}><Trash2 size={13} /> Löschen</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProgressList({ progress }: { progress: ExerciseProgress[] }) {
  return (
    <section className="card card-pad h-fit">
      <h2 className="h2 flex items-center gap-2"><Trophy size={18} className="text-[#F08C2E]" /> Fortschritt</h2>
      {progress.length === 0 ? <p className="muted mt-2">Hier siehst du pro Übung deine Bestleistung und wie sie sich entwickelt.</p> : (
        <ul className="mt-3 space-y-3">
          {progress.map(p => (
            <li key={p.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-ink-soft">Bestleistung: {p.best} · {p.times}×</span>
              </span>
              <Spark points={p.points.map(x => x.value)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="w-24 text-right text-xs text-ink-faint">–</span>;
  const pts = points.slice(-12);
  const min = Math.min(...pts), max = Math.max(...pts), w = 96, h = 28;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={up ? 'steigend' : 'fallend'} role="img">
      <polyline points={d} fill="none" stroke={up ? '#286B24' : '#8B8E84'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
