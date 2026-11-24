import 'server-only';
// Sport: workout templates, live workout logging, history and progress – connected to the rest of CLOQI:
//  • a template can be put into the calendar on weekdays (one weekly series) → the study planner plans around it
//  • hints use the calendar (test tomorrow) and – only if the user enabled Cycle – the cycle phase
//  • CLOQI AI can read the history and log workouts (lib/ai.ts)
import { db, newId } from './db';
import { getCalendarItems } from './calendar';
import { summarize } from './cycle';
import { createEvent, deleteEvent, getEvent, hasCycleConsent, listCycleEntries, updateEvent } from './repo';
import { oneRepMax, volume, type WorkoutExercise } from './sport-data';
import { addDays, todayIn, utcToZoned, weekdayOf, zonedToUtc } from './time';
import type { User } from './types';
import { InputError } from './validate';

export interface WorkoutTemplate {
  id: string; name: string; exercises: WorkoutExercise[];
  schedule: { weekdays: number[]; time: string; minutes: number } | null; eventId: string | null;
}
export interface Workout {
  id: string; templateId: string | null; name: string; startedAt: string; finishedAt: string | null; exercises: WorkoutExercise[]; note: string | null;
}

const parse = <T>(v: unknown, fb: T): T => { if (v == null) return fb; if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
const toTemplate = (r: Record<string, unknown>): WorkoutTemplate => ({
  id: String(r.id), name: String(r.name), exercises: parse(r.exercises, []), schedule: parse(r.schedule, null), eventId: r.event_id ? String(r.event_id) : null,
});
const toWorkout = (r: Record<string, unknown>): Workout => ({
  id: String(r.id), templateId: r.template_id ? String(r.template_id) : null, name: String(r.name), startedAt: new Date(String(r.started_at)).toISOString(),
  finishedAt: r.finished_at ? new Date(String(r.finished_at)).toISOString() : null, exercises: parse(r.exercises, []), note: r.note ? String(r.note) : null,
});

/** Keeps only sane numbers – the browser sends these. */
export function cleanExercises(raw: unknown): WorkoutExercise[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : null);
  return raw.slice(0, 30).map(e => {
    const x = (e ?? {}) as Record<string, unknown>;
    const kind = ['weight', 'body', 'time', 'cardio'].includes(String(x.kind)) ? String(x.kind) as WorkoutExercise['kind'] : 'weight';
    return {
      id: String(x.id ?? 'custom').slice(0, 40), name: String(x.name ?? 'Übung').slice(0, 80), kind,
      sets: (Array.isArray(x.sets) ? x.sets : []).slice(0, 30).map(s => {
        const y = (s ?? {}) as Record<string, unknown>;
        return { kg: num(y.kg, 1000), reps: num(y.reps, 1000), sec: num(y.sec, 86400), km: num(y.km, 1000), done: y.done === true };
      }),
    };
  }).filter(e => e.name.trim());
}

// ---------------------------------------------------------------- templates

export async function listTemplates(userId: string): Promise<WorkoutTemplate[]> {
  return (await (await db()).all('SELECT * FROM workout_templates WHERE user_id = ? ORDER BY lower(name)', [userId])).map(toTemplate);
}

export async function saveTemplate(userId: string, t: { id?: string | null; name: string; exercises: unknown }): Promise<string> {
  const name = t.name.trim().slice(0, 60);
  if (!name) throw new InputError('Gib der Vorlage einen Namen.');
  const exercises = cleanExercises(t.exercises).map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, done: false })) }));
  const q = await db();
  if (t.id) {
    await q.run('UPDATE workout_templates SET name = ?, exercises = ?, updated_at = now() WHERE id = ? AND user_id = ?', [name, JSON.stringify(exercises), t.id, userId]);
    return t.id;
  }
  const id = newId();
  await q.run('INSERT INTO workout_templates (id, user_id, name, exercises) VALUES (?, ?, ?, ?)', [id, userId, name, JSON.stringify(exercises)]);
  return id;
}

export async function deleteTemplate(userId: string, id: string) {
  const t = (await listTemplates(userId)).find(x => x.id === id);
  if (!t) return;
  if (t.eventId) await deleteEvent(userId, t.eventId).catch(() => undefined);
  await (await db()).run('DELETE FROM workout_templates WHERE id = ? AND user_id = ?', [id, userId]);
}

/**
 * Puts a template into the calendar as ONE weekly series on the chosen weekdays (e.g. Mo + Mi 18:00, 90 min).
 * The study planner treats it like any appointment – study blocks are planned around training automatically.
 */
export async function scheduleTemplate(user: User, id: string, s: { weekdays: number[]; time: string; minutes: number } | null) {
  const t = (await listTemplates(user.id)).find(x => x.id === id);
  if (!t) throw new InputError('Vorlage nicht gefunden.');
  const q = await db();
  if (!s || !s.weekdays.length) {
    if (t.eventId) await deleteEvent(user.id, t.eventId).catch(() => undefined);
    await q.run('UPDATE workout_templates SET schedule = NULL, event_id = NULL WHERE id = ?', [id]);
    return;
  }
  const days = [...new Set(s.weekdays.filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (!/^\d{2}:\d{2}$/.test(s.time)) throw new InputError('Ungültige Uhrzeit.');
  const minutes = Math.min(300, Math.max(15, Math.round(s.minutes)));
  // first date: the next chosen weekday from today
  const today = todayIn(user.timezone);
  let first = today;
  for (let i = 0; i < 7; i++) { const d = addDays(today, i); if (days.includes(weekdayOf(d))) { first = d; break; } }
  const startAt = zonedToUtc(first, s.time, user.timezone);
  const fields = {
    title: `Training: ${t.name}`, startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + minutes * 60000).toISOString(),
    allDay: false, category: 'training' as const, description: 'Aus deinem Sport-Plan in CLOQI', reminderMinutes: 30,
    recurrenceFreq: 'weekly' as const, recurrenceInterval: 1, recurrenceUntil: null, recurrenceDays: days.length > 1 ? days : null,
  };
  let eventId = t.eventId && (await getEvent(user.id, t.eventId)) ? t.eventId : null;
  if (eventId) await updateEvent(user.id, eventId, fields);
  else eventId = await createEvent(user.id, { ...fields, source: 'manual' });
  await q.run('UPDATE workout_templates SET schedule = ?, event_id = ? WHERE id = ?', [JSON.stringify({ weekdays: days, time: s.time, minutes }), eventId, id]);
}

/** A finished workout told to CLOQI AI ("heute Bankdrücken 3×8 mit 60 kg"). */
export async function logWorkout(user: User, w: { name: string; date: string | null; minutes: number | null; exercises: unknown }): Promise<WorkoutSummary> {
  const exercises = cleanExercises(w.exercises).map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, done: true })) }));
  if (!exercises.length) throw new InputError('Welche Übungen hast du gemacht?');
  const day = w.date ?? todayIn(user.timezone);
  const end = w.date ? zonedToUtc(day, '19:00', user.timezone) : new Date();
  const startedAt = new Date(end.getTime() - Math.min(300, Math.max(10, w.minutes ?? 60)) * 60000).toISOString();
  const id = newId();
  await (await db()).run('INSERT INTO workouts (id, user_id, name, started_at, exercises) VALUES (?, ?, ?, ?, ?)', [id, user.id, w.name.trim().slice(0, 60) || 'Training', startedAt, JSON.stringify(exercises)]);
  return finishWorkout(user.id, id, { exercises }, { startedAt, finishedAt: end.toISOString() });
}

// ---------------------------------------------------------------- workouts

export async function activeWorkout(userId: string): Promise<Workout | null> {
  const r = await (await db()).get('SELECT * FROM workouts WHERE user_id = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1', [userId]);
  return r ? toWorkout(r) : null;
}

/** Last finished sets of an exercise (shown as "Letztes Mal" and used to prefill). */
export async function lastSets(userId: string, exerciseIds: string[]): Promise<Record<string, WorkoutExercise['sets']>> {
  const rows = (await (await db()).all('SELECT exercises FROM workouts WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 40', [userId])).map(r => parse<WorkoutExercise[]>(r.exercises, []));
  const out: Record<string, WorkoutExercise['sets']> = {};
  for (const id of exerciseIds) {
    for (const ex of rows) { const hit = ex.find(e => e.id === id && e.sets.some(s => s.done)); if (hit) { out[id] = hit.sets.filter(s => s.done); break; } }
  }
  return out;
}

/** Starts a workout from a template (sets prefilled with last time's numbers) or an empty one. One active workout at a time. */
export async function startWorkout(userId: string, templateId: string | null): Promise<Workout> {
  const running = await activeWorkout(userId);
  if (running) return running;
  const t = templateId ? (await listTemplates(userId)).find(x => x.id === templateId) : null;
  const last = t ? await lastSets(userId, t.exercises.map(e => e.id)) : {};
  const exercises = (t?.exercises ?? []).map(e => ({
    ...e, sets: (last[e.id]?.length ? last[e.id] : e.sets.length ? e.sets : [{}]).map(s => ({ kg: s.kg ?? null, reps: s.reps ?? null, sec: s.sec ?? null, km: s.km ?? null, done: false })),
  }));
  const id = newId();
  await (await db()).run('INSERT INTO workouts (id, user_id, template_id, name, exercises) VALUES (?, ?, ?, ?, ?)', [id, userId, t?.id ?? null, t?.name ?? 'Training', JSON.stringify(exercises)]);
  return (await activeWorkout(userId))!;
}

export async function saveWorkout(userId: string, id: string, w: { name?: string; exercises: unknown; note?: string | null }) {
  await (await db()).run('UPDATE workouts SET name = coalesce(?, name), exercises = ?, note = ? WHERE id = ? AND user_id = ?',
    [w.name?.trim().slice(0, 60) || null, JSON.stringify(cleanExercises(w.exercises)), w.note?.slice(0, 1000) ?? null, id, userId]);
}

export interface WorkoutSummary { minutes: number; sets: number; volume: number; records: { name: string; label: string }[] }

/** Finishes the workout and reports new personal records (best estimated 1RM, longest time, most reps). */
export async function finishWorkout(userId: string, id: string, w: { exercises: unknown; note?: string | null }, at?: { startedAt?: string; finishedAt?: string }): Promise<WorkoutSummary> {
  const q = await db();
  const exercises = cleanExercises(w.exercises).map(e => ({ ...e, sets: e.sets.filter(s => s.done) })).filter(e => e.sets.length);
  if (!exercises.length) throw new InputError('Hake mindestens einen Satz ab.');
  const before = await progressAll(userId);
  await q.run(`UPDATE workouts SET exercises = ?, note = ?, finished_at = ?, started_at = coalesce(?, started_at) WHERE id = ? AND user_id = ?`,
    [JSON.stringify(exercises), w.note?.slice(0, 1000) ?? null, at?.finishedAt ?? new Date().toISOString(), at?.startedAt ?? null, id, userId]);
  const row = await q.get('SELECT started_at, finished_at FROM workouts WHERE id = ?', [id]);
  const records: WorkoutSummary['records'] = [];
  for (const e of exercises) {
    const best = bestOf(e);
    const prev = before[e.id];
    if (best && (!prev || best.value > prev.value)) records.push({ name: e.name, label: best.label });
  }
  return {
    minutes: Math.max(1, Math.round((Date.parse(String(row?.finished_at)) - Date.parse(String(row?.started_at))) / 60000)),
    sets: exercises.reduce((n, e) => n + e.sets.length, 0), volume: volume(exercises), records,
  };
}

export async function deleteWorkout(userId: string, id: string) {
  await (await db()).run('DELETE FROM workouts WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function listWorkouts(userId: string, limit = 30): Promise<Workout[]> {
  return (await (await db()).all('SELECT * FROM workouts WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT ?', [userId, limit])).map(toWorkout);
}

/** Best value of one exercise in one workout: 1RM for weights, reps for bodyweight, seconds, minutes. */
function bestOf(e: WorkoutExercise): { value: number; label: string } | null {
  let best: { value: number; label: string } | null = null;
  for (const s of e.sets) {
    let v = 0, label = '';
    if (e.kind === 'weight' && s.kg && s.reps) { v = oneRepMax(s.kg, s.reps); label = `${s.kg} kg × ${s.reps} (≈ ${v} kg 1RM)`; }
    else if (e.kind === 'body' && s.reps) { v = s.reps + (s.kg ?? 0) / 10; label = `${s.reps} Wdh.${s.kg ? ` mit ${s.kg} kg` : ''}`; }
    else if (e.kind === 'time' && s.sec) { v = s.sec; label = `${s.sec} s`; }
    else if (e.kind === 'cardio' && (s.km || s.sec)) { v = s.km ?? (s.sec ?? 0) / 60; label = s.km ? `${s.km} km` : `${Math.round((s.sec ?? 0) / 60)} min`; }
    if (v && (!best || v > best.value)) best = { value: v, label };
  }
  return best;
}

/** Best value per exercise over all finished workouts. */
async function progressAll(userId: string): Promise<Record<string, { value: number; label: string }>> {
  const out: Record<string, { value: number; label: string }> = {};
  for (const w of await listWorkouts(userId, 500)) for (const e of w.exercises) {
    const b = bestOf(e);
    if (b && (!out[e.id] || b.value > out[e.id].value)) out[e.id] = b;
  }
  return out;
}

export interface ExerciseProgress { id: string; name: string; kind: WorkoutExercise['kind']; best: string; points: { date: string; value: number }[]; times: number }

/** Progress per exercise (oldest → newest), for the progress view and CLOQI AI. */
export async function exerciseProgress(user: User): Promise<ExerciseProgress[]> {
  const map = new Map<string, ExerciseProgress & { bestValue: number }>();
  for (const w of (await listWorkouts(user.id, 500)).reverse()) for (const e of w.exercises) {
    const b = bestOf(e);
    if (!b) continue;
    const p = map.get(e.id) ?? { id: e.id, name: e.name, kind: e.kind, best: b.label, bestValue: b.value, points: [], times: 0 };
    p.points.push({ date: utcToZoned(w.finishedAt!, user.timezone).date, value: b.value });
    p.times++;
    if (b.value >= p.bestValue) { p.bestValue = b.value; p.best = b.label; }
    map.set(e.id, p);
  }
  return [...map.values()].sort((a, b) => b.times - a.times).map(({ bestValue: _b, ...p }) => p);
}

export interface WeekStats { workouts: number; minutes: number; volume: number; streakWeeks: number }

export async function weekStats(user: User): Promise<WeekStats> {
  const today = todayIn(user.timezone);
  const monday = addDays(today, 1 - weekdayOf(today));
  const all = await listWorkouts(user.id, 200);
  const day = (w: Workout) => utcToZoned(w.finishedAt!, user.timezone).date;
  const thisWeek = all.filter(w => day(w) >= monday);
  // weeks in a row with at least one workout (this week counts once it has one)
  let streak = 0;
  for (let k = thisWeek.length ? 0 : 1; k < 52; k++) {
    const from = addDays(monday, -7 * k), to = addDays(from, 7);
    if (all.some(w => day(w) >= from && day(w) < to)) streak++; else break;
  }
  return {
    workouts: thisWeek.length, volume: thisWeek.reduce((v, w) => v + volume(w.exercises), 0), streakWeeks: streak,
    minutes: thisWeek.reduce((m, w) => m + Math.round((Date.parse(w.finishedAt!) - Date.parse(w.startedAt)) / 60000), 0),
  };
}

/**
 * Where Sport meets the rest of CLOQI: a test tomorrow, a free afternoon (Entfall), the cycle phase (only with consent).
 * Short, practical hints – shown on the Sport page.
 */
export async function sportHints(user: User): Promise<string[]> {
  const hints: string[] = [];
  const today = todayIn(user.timezone);
  const from = zonedToUtc(today, '00:00', user.timezone).toISOString();
  const to = zonedToUtc(addDays(today, 2), '00:00', user.timezone).toISOString();
  const items = await getCalendarItems(user, from, to, { includeHidden: true }).catch(() => []);
  const tomorrow = addDays(today, 1);
  const examTomorrow = items.find(i => (i.category === 'pruefung' || i.kind === 'deadline') && utcToZoned(i.startAt, user.timezone).date === tomorrow && /test|schularbeit|prüfung|sa\b/i.test(i.title));
  const trainingToday = items.find(i => i.category === 'training' && utcToZoned(i.startAt, user.timezone).date === today);
  if (examTomorrow && trainingToday) hints.push(`Morgen: ${examTomorrow.title}. Heute lieber ein kürzeres, lockeres Training – und danach rechtzeitig schlafen.`);
  const cancelled = items.filter(i => i.status === 'cancelled' && utcToZoned(i.startAt, user.timezone).date === today);
  if (cancelled.length) hints.push(`Heute fällt ${cancelled.length === 1 ? 'eine Stunde' : `${cancelled.length} Stunden`} aus – Zeit, das Training vorzuziehen?`);
  if (user.prefs.cycleEnabled && await hasCycleConsent(user.id)) {
    const s = summarize(await listCycleEntries(user.id), today);
    if (s.phase === 'menstruation') hints.push('Periode: Bewegung kann Krämpfe lindern – hör auf deinen Körper, lockere Einheiten sind völlig okay.');
    else if (s.phase === 'follikel') hints.push('Follikelphase: viele fühlen sich jetzt kräftig – ein guter Zeitpunkt für schwere Sätze.');
    else if (s.phase === 'luteal' && s.daysUntilNext !== null && s.daysUntilNext <= 5) hints.push('Die Periode kommt bald – falls du müder bist: weniger Gewicht, gleiche Technik.');
  }
  return hints;
}
