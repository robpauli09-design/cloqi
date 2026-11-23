import 'server-only';
import { db, newId, nowIso, type Db, type Param, type Row } from './db';
import { decrypt, encrypt } from './crypto';
import {
  DEFAULT_PREFS, type CalendarConnection, type CalendarEvent, type CalendarKind, type Category, type CycleEntry, type Prefs, type Provider,
  type StudyBlock, type Subject, type Suggestion, type Task, type TimetableEntry, type User, type UserCalendar,
} from './types';

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
/** jsonb arrives parsed; tolerate strings too. */
const json = <T>(v: unknown, fallback: T): T => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return fallback; }
};
const all = async (sql: string, p: Param[] = []) => (await db()).all(sql, p);
const get = async (sql: string, p: Param[] = []) => (await db()).get(sql, p);
const run = async (sql: string, p: Param[] = []) => (await db()).run(sql, p);

// =====================================================================
// users = users + profiles (1:1) + study_settings (1:1) + subjects (1:n)
// =====================================================================

const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.created_at,
         p.display_name, p.user_type, p.gender, p.timezone, p.mascot, p.life_areas, p.onboarded_at,
         p.cycle_enabled, p.cycle_in_calendar,
         s.weekday_start, s.weekday_end, s.weekend_start, s.weekend_end, s.study_on_sunday, s.max_minutes_per_day,
         s.max_block_minutes, s.break_minutes, s.daily_goal_minutes, s.default_reminder_minutes
  FROM users u JOIN profiles p ON p.user_id = u.id JOIN study_settings s ON s.user_id = u.id`;

async function toUser(r: Row): Promise<User> {
  const subjects = (await all('SELECT name, difficulty FROM subjects WHERE user_id = ? ORDER BY lower(name)', [String(r.id)]))
    .map(x => ({ name: String(x.name), difficulty: Number(x.difficulty) as Subject['difficulty'] }));
  const prefs: Prefs = {
    ...DEFAULT_PREFS,
    studyStart: String(r.weekday_start), studyEnd: String(r.weekday_end),
    weekendStart: String(r.weekend_start), weekendEnd: String(r.weekend_end), studyOnSunday: Boolean(r.study_on_sunday),
    maxStudyPerDay: Number(r.max_minutes_per_day), blockMax: Number(r.max_block_minutes), breakMin: Number(r.break_minutes),
    dailyGoalMin: Number(r.daily_goal_minutes), reminderDefault: Number(r.default_reminder_minutes),
    subjects, mascot: r.mascot === 'clea' ? 'clea' : 'cloki',
    cycleEnabled: Boolean(r.cycle_enabled), cycleInCalendar: Boolean(r.cycle_in_calendar),
  };
  return {
    id: String(r.id), email: String(r.email), name: String(r.display_name ?? ''),
    userType: (str(r.user_type) as User['userType']) ?? null,
    gender: r.gender === 'm' || r.gender === 'w' || r.gender === 'd' ? r.gender : null, timezone: String(r.timezone),
    onboarded: r.onboarded_at !== null && r.onboarded_at !== undefined, lifeAreas: json<string[]>(r.life_areas, []),
    prefs, createdAt: String(r.created_at),
  };
}

export async function findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const r = await get(`${USER_SELECT} WHERE u.email = ?`, [email.toLowerCase()]);
  return r ? { ...(await toUser(r)), passwordHash: String(r.password_hash) } : null;
}

export async function getUser(id: string): Promise<User | null> {
  const r = await get(`${USER_SELECT} WHERE u.id = ?`, [id]);
  return r ? toUser(r) : null;
}

/** Creates the account with its profile, default study settings and built-in calendars in one transaction. */
export async function createUser(email: string, passwordHash: string, timezone: string): Promise<User> {
  const id = newId();
  await (await db()).tx(async q => {
    await q.run('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [id, email.toLowerCase(), passwordHash]);
    await q.run('INSERT INTO profiles (user_id, timezone) VALUES (?, ?)', [id, timezone]);
    await q.run('INSERT INTO study_settings (user_id) VALUES (?)', [id]);
    for (const [i, c] of DEFAULT_CALENDARS.entries()) {
      await q.run('INSERT INTO calendars (user_id, name, color, kind, is_writable, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, c.name, c.color, c.kind, c.writable, new Date(Date.now() + i).toISOString()]);
    }
  });
  return (await getUser(id))!;
}

export async function touchLogin(id: string) {
  await run('UPDATE users SET last_login_at = now() WHERE id = ?', [id]);
}

export async function updateUser(id: string, patch: Partial<Pick<User, 'name' | 'userType' | 'gender' | 'timezone' | 'onboarded' | 'lifeAreas' | 'prefs'>>) {
  const sets: string[] = [];
  const vals: Param[] = [];
  if (patch.name !== undefined) { sets.push('display_name = ?'); vals.push(patch.name); }
  if (patch.userType !== undefined) { sets.push('user_type = ?'); vals.push(patch.userType); }
  if (patch.gender !== undefined) { sets.push('gender = ?'); vals.push(patch.gender); }
  if (patch.timezone !== undefined) { sets.push('timezone = ?'); vals.push(patch.timezone); }
  if (patch.onboarded !== undefined) { sets.push(patch.onboarded ? 'onboarded_at = coalesce(onboarded_at, now())' : 'onboarded_at = NULL'); }
  if (patch.lifeAreas !== undefined) { sets.push('life_areas = ?'); vals.push(JSON.stringify(patch.lifeAreas)); }
  const p = patch.prefs;
  if (p) {
    sets.push('mascot = ?', 'cycle_enabled = ?', 'cycle_in_calendar = ?');
    vals.push(p.mascot, p.cycleEnabled, p.cycleInCalendar);
  }
  await (await db()).tx(async q => {
    if (sets.length) await q.run(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...vals, id]);
    if (!p) return;
    await q.run(`UPDATE study_settings SET weekday_start = ?, weekday_end = ?, weekend_start = ?, weekend_end = ?, study_on_sunday = ?,
      max_minutes_per_day = ?, max_block_minutes = ?, break_minutes = ?, daily_goal_minutes = ?, default_reminder_minutes = ? WHERE user_id = ?`,
    [p.studyStart, p.studyEnd, p.weekendStart, p.weekendEnd, p.studyOnSunday, p.maxStudyPerDay, p.blockMax, p.breakMin, p.dailyGoalMin, p.reminderDefault, id]);
    // subjects: replace the set (small list, keeps ids stable for unchanged names)
    const names = p.subjects.map(s => s.name.toLowerCase());
    const existing = await q.all('SELECT id, name FROM subjects WHERE user_id = ?', [id]);
    for (const e of existing) if (!names.includes(String(e.name).toLowerCase())) await q.run('DELETE FROM subjects WHERE id = ?', [String(e.id)]);
    for (const s of p.subjects) {
      const hit = existing.find(e => String(e.name).toLowerCase() === s.name.toLowerCase());
      if (hit) await q.run('UPDATE subjects SET name = ?, difficulty = ? WHERE id = ?', [s.name, s.difficulty, String(hit.id)]);
      else await q.run('INSERT INTO subjects (user_id, name, difficulty) VALUES (?, ?, ?)', [id, s.name, s.difficulty]);
    }
  });
}

export async function deleteUser(id: string) {
  await run('DELETE FROM users WHERE id = ?', [id]); // cascades to every personal table
}

async function subjectIdFor(q: Db, userId: string, name: string): Promise<string | null> {
  const r = await q.get('SELECT id FROM subjects WHERE user_id = ? AND lower(name) = lower(?)', [userId, name]);
  return r ? String(r.id) : null;
}

// ---------- sessions ----------

export async function insertSession(tokenHash: string, userId: string, expiresAt: string) {
  await run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash, userId, expiresAt]);
}
export async function findSession(tokenHash: string): Promise<{ userId: string; expiresAt: string } | null> {
  const r = await get('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', [tokenHash]);
  return r ? { userId: String(r.user_id), expiresAt: String(r.expires_at) } : null;
}
export async function deleteSession(tokenHash: string) { await run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]); }
export async function deleteExpiredSessions() { await run('DELETE FROM sessions WHERE expires_at < now()'); }

// =====================================================================
// calendars
// =====================================================================

function rowToCalendar(r: Row): UserCalendar {
  return {
    id: String(r.id), userId: String(r.user_id), name: String(r.name), color: String(r.color), kind: String(r.kind) as CalendarKind,
    connectionId: str(r.connection_id), externalId: str(r.external_id), visible: Boolean(r.is_visible), writable: Boolean(r.is_writable),
  };
}

export const DEFAULT_CALENDARS: { name: string; color: string; kind: CalendarKind; writable: boolean }[] = [
  { name: 'CLOQI', color: '#7CC51B', kind: 'cloqi', writable: true },
  { name: 'Lernplan', color: '#A4D92D', kind: 'study', writable: true },
  { name: 'Stundenplan', color: '#286B24', kind: 'timetable', writable: true },
];

const SINGLETONS: Partial<Record<CalendarKind, { name: string; color: string; writable: boolean }>> = {
  cloqi: { name: 'CLOQI', color: '#7CC51B', writable: true },
  study: { name: 'Lernplan', color: '#A4D92D', writable: true },
  timetable: { name: 'Stundenplan', color: '#286B24', writable: true },
  ics: { name: 'Importierte Termine', color: '#5B6472', writable: true },
  webuntis: { name: 'WebUntis', color: '#286B24', writable: false },
};

export async function listCalendars(userId: string): Promise<UserCalendar[]> {
  return (await all('SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at', [userId])).map(rowToCalendar);
}

/** Built-in calendar of a kind (created on demand; unique per user via index). */
export async function calendarOfKind(userId: string, kind: CalendarKind, connectionId: string | null = null): Promise<UserCalendar> {
  const def = SINGLETONS[kind];
  if (!def) throw new Error(`Kein eingebauter Kalender: ${kind}`);
  await run(`INSERT INTO calendars (user_id, name, color, kind, connection_id, is_writable) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, kind) WHERE kind IN ('cloqi', 'study', 'timetable', 'webuntis', 'ics') DO NOTHING`,
  [userId, def.name, def.color, kind, connectionId, def.writable]);
  const r = await get('SELECT * FROM calendars WHERE user_id = ? AND kind = ?', [userId, kind]);
  if (connectionId && r && r.connection_id !== connectionId) await run('UPDATE calendars SET connection_id = ? WHERE id = ?', [connectionId, String(r.id)]);
  return rowToCalendar({ ...r!, connection_id: connectionId ?? r!.connection_id });
}

export async function getCalendar(userId: string, id: string): Promise<UserCalendar | null> {
  const r = await get('SELECT * FROM calendars WHERE id = ? AND user_id = ?', [id, userId]);
  return r ? rowToCalendar(r) : null;
}

export async function createCalendar(userId: string, c: { name: string; color: string; kind: CalendarKind; connectionId?: string | null; externalId?: string | null; writable?: boolean }): Promise<string> {
  const id = newId();
  await run('INSERT INTO calendars (id, user_id, name, color, kind, connection_id, external_id, is_writable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, c.name.slice(0, 60), c.color, c.kind, c.connectionId ?? null, c.externalId ?? null, c.writable !== false]);
  return id;
}

export async function updateCalendar(userId: string, id: string, patch: Partial<Pick<UserCalendar, 'name' | 'color' | 'visible'>>) {
  if (patch.name !== undefined) await run('UPDATE calendars SET name = ? WHERE id = ? AND user_id = ?', [patch.name, id, userId]);
  if (patch.color !== undefined) await run('UPDATE calendars SET color = ? WHERE id = ? AND user_id = ?', [patch.color, id, userId]);
  if (patch.visible !== undefined) await run('UPDATE calendars SET is_visible = ? WHERE id = ? AND user_id = ?', [patch.visible, id, userId]);
}

export async function deleteCalendar(userId: string, id: string) {
  await run('DELETE FROM calendars WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function calendarsForConnection(userId: string, connectionId: string): Promise<UserCalendar[]> {
  return (await all('SELECT * FROM calendars WHERE user_id = ? AND connection_id = ?', [userId, connectionId])).map(rowToCalendar);
}

// =====================================================================
// events
// =====================================================================

const EVENT_SELECT = 'SELECT e.*, c.connection_id FROM events e JOIN calendars c ON c.id = e.calendar_id';

function rowToEvent(r: Row): CalendarEvent {
  return {
    id: String(r.id), userId: String(r.user_id), calendarId: str(r.calendar_id), title: String(r.title), description: str(r.description),
    startAt: String(r.starts_at), endAt: String(r.ends_at), allDay: Boolean(r.all_day),
    category: String(r.category) as Category, source: String(r.source) as CalendarEvent['source'],
    externalUid: str(r.external_uid), connectionId: str(r.connection_id),
    status: String(r.status) as CalendarEvent['status'], location: str(r.location), teacher: str(r.teacher),
    reminderMinutes: r.reminder_minutes === null || r.reminder_minutes === undefined ? null : Number(r.reminder_minutes),
    recurrenceFreq: (str(r.recurrence_freq) as CalendarEvent['recurrenceFreq']) ?? null,
    recurrenceInterval: Number(r.recurrence_interval ?? 1) || 1, recurrenceUntil: str(r.recurrence_until),
    exdates: json<string[]>(r.exdates, []), seriesId: str(r.series_id),
    syncState: (str(r.sync_state) as CalendarEvent['syncState']) ?? 'clean', remoteVersion: str(r.remote_version),
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}

/** Events overlapping [from, to) plus recurring series that started before `to`. */
export async function listEvents(userId: string, from: string, to: string): Promise<CalendarEvent[]> {
  const rows = await all(`${EVENT_SELECT} WHERE e.user_id = ? AND (
      (e.recurrence_freq IS NULL AND e.starts_at < ? AND e.ends_at > ?) OR
      (e.recurrence_freq IS NOT NULL AND e.starts_at < ? AND (e.recurrence_until IS NULL OR e.recurrence_until >= ?::date))
    ) ORDER BY e.starts_at`, [userId, to, from, to, from.slice(0, 10)]);
  return rows.map(rowToEvent);
}

export async function getEvent(userId: string, id: string): Promise<CalendarEvent | null> {
  const r = await get(`${EVENT_SELECT} WHERE e.id = ? AND e.user_id = ?`, [id, userId]);
  return r ? rowToEvent(r) : null;
}

export interface EventInput {
  title: string; description?: string | null; startAt: string; endAt: string; allDay?: boolean; calendarId?: string | null;
  category: Category; source?: CalendarEvent['source']; externalUid?: string | null; connectionId?: string | null;
  status?: CalendarEvent['status']; location?: string | null; teacher?: string | null; reminderMinutes?: number | null;
  recurrenceFreq?: CalendarEvent['recurrenceFreq']; recurrenceInterval?: number; recurrenceUntil?: string | null;
  exdates?: string[]; seriesId?: string | null; syncState?: CalendarEvent['syncState']; remoteVersion?: string | null;
}

export async function createEvent(userId: string, e: EventInput): Promise<string> {
  const id = newId();
  const calendarId = e.calendarId ?? (await calendarOfKind(userId, 'cloqi')).id;
  await run(`INSERT INTO events (id, user_id, calendar_id, title, description, location, teacher, starts_at, ends_at, all_day, category, source,
      status, reminder_minutes, recurrence_freq, recurrence_interval, recurrence_until, exdates, series_id, external_uid, sync_state, remote_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, userId, calendarId, e.title.slice(0, 200), e.description ?? null, e.location ?? null, e.teacher ?? null, e.startAt, e.endAt,
    e.allDay ?? false, e.category, e.source ?? 'manual', e.status ?? 'active', e.reminderMinutes ?? null, e.recurrenceFreq ?? null,
    e.recurrenceInterval ?? 1, e.recurrenceFreq ? e.recurrenceUntil ?? null : null, JSON.stringify(e.exdates ?? []), e.seriesId ?? null,
    e.externalUid ?? null, e.syncState ?? 'clean', e.remoteVersion ?? null]);
  return id;
}

const EVENT_COLUMNS: Record<string, string> = {
  title: 'title', description: 'description', startAt: 'starts_at', endAt: 'ends_at', category: 'category', status: 'status',
  location: 'location', teacher: 'teacher', reminderMinutes: 'reminder_minutes', recurrenceFreq: 'recurrence_freq',
  recurrenceInterval: 'recurrence_interval', recurrenceUntil: 'recurrence_until', calendarId: 'calendar_id', seriesId: 'series_id',
  syncState: 'sync_state', remoteVersion: 'remote_version', externalUid: 'external_uid', allDay: 'all_day',
};

export async function updateEvent(userId: string, id: string, e: Partial<EventInput>) {
  const sets: string[] = [];
  const vals: Param[] = [];
  for (const [k, col] of Object.entries(EVENT_COLUMNS)) {
    const v = (e as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v as Param); }
  }
  if (e.exdates !== undefined) { sets.push('exdates = ?'); vals.push(JSON.stringify(e.exdates)); }
  if (e.recurrenceFreq === null && e.recurrenceUntil === undefined) sets.push('recurrence_until = NULL');
  if (!sets.length) return;
  await run(`UPDATE events SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...vals, id, userId]);
}

export async function deleteEvent(userId: string, id: string) {
  await run('DELETE FROM events WHERE id = ? AND user_id = ?', [id, userId]); // detached occurrences cascade via series_id
}

export async function eventsBySource(userId: string, source: string): Promise<CalendarEvent[]> {
  return (await all(`${EVENT_SELECT} WHERE e.user_id = ? AND e.source = ?`, [userId, source])).map(rowToEvent);
}

export async function eventsByConnection(userId: string, connectionId: string): Promise<CalendarEvent[]> {
  return (await all(`${EVENT_SELECT} WHERE e.user_id = ? AND c.connection_id = ?`, [userId, connectionId])).map(rowToEvent);
}

// =====================================================================
// timetable
// =====================================================================

function rowToEntry(r: Row): TimetableEntry {
  return {
    id: String(r.id), userId: String(r.user_id), source: String(r.source) as TimetableEntry['source'],
    subject: String(r.subject), teacher: str(r.teacher), room: str(r.room), institution: str(r.institution),
    weekday: Number(r.weekday), startTime: String(r.starts), endTime: String(r.ends), exdates: json<string[]>(r.exdates, []),
  };
}

export async function listTimetable(userId: string): Promise<TimetableEntry[]> {
  return (await all('SELECT * FROM timetable_entries WHERE user_id = ? ORDER BY weekday, starts', [userId])).map(rowToEntry);
}

export async function addTimetableEntry(userId: string, e: Omit<TimetableEntry, 'id' | 'userId' | 'exdates'>): Promise<string> {
  const id = newId();
  const q = await db();
  await q.run(`INSERT INTO timetable_entries (id, user_id, subject_id, subject, weekday, starts, ends, room, teacher, institution, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, userId, await subjectIdFor(q, userId, e.subject), e.subject, e.weekday, e.startTime, e.endTime, e.room, e.teacher, e.institution, e.source]);
  return id;
}

export async function setTimetableExdates(userId: string, id: string, exdates: string[]) {
  await run('UPDATE timetable_entries SET exdates = ? WHERE id = ? AND user_id = ?', [JSON.stringify(exdates), id, userId]);
}

export async function getTimetableEntry(userId: string, id: string): Promise<TimetableEntry | null> {
  const r = await get('SELECT * FROM timetable_entries WHERE id = ? AND user_id = ?', [id, userId]);
  return r ? rowToEntry(r) : null;
}

export async function deleteTimetableEntry(userId: string, id: string) {
  await run('DELETE FROM timetable_entries WHERE id = ? AND user_id = ?', [id, userId]);
}

export interface TimetableBreak { id: string; name: string; startDate: string; endDate: string }

export async function listBreaks(userId: string): Promise<TimetableBreak[]> {
  return (await all('SELECT * FROM school_holidays WHERE user_id = ? ORDER BY starts_on', [userId]))
    .map(r => ({ id: String(r.id), name: String(r.name), startDate: String(r.starts_on), endDate: String(r.ends_on) }));
}

export async function addBreak(userId: string, name: string, startDate: string, endDate: string) {
  await run('INSERT INTO school_holidays (user_id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', [userId, name, startDate, endDate]);
}

export async function deleteBreak(userId: string, id: string) {
  await run('DELETE FROM school_holidays WHERE id = ? AND user_id = ?', [id, userId]);
}

// =====================================================================
// tasks & study blocks
// =====================================================================

function rowToTask(r: Row): Task {
  return {
    id: String(r.id), userId: String(r.user_id), title: String(r.title), subject: String(r.subject),
    kind: String(r.kind) as Task['kind'], dueAt: String(r.due_at), estimatedMinutes: Number(r.estimated_minutes),
    difficulty: Number(r.difficulty) as Task['difficulty'], status: String(r.status) as Task['status'],
    priority: Number(r.priority) as Task['priority'], notBefore: str(r.not_before), createdAt: String(r.created_at),
  };
}

export async function listTasks(userId: string, opts: { openOnly?: boolean } = {}): Promise<Task[]> {
  const sql = `SELECT * FROM tasks WHERE user_id = ? ${opts.openOnly ? "AND status = 'open'" : ''} ORDER BY due_at`;
  return (await all(sql, [userId])).map(rowToTask);
}

export async function getTask(userId: string, id: string): Promise<Task | null> {
  const r = await get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
  return r ? rowToTask(r) : null;
}

export async function createTask(userId: string, t: Omit<Task, 'id' | 'userId' | 'createdAt' | 'status' | 'notBefore'> & { notBefore?: string | null }): Promise<string> {
  const id = newId();
  const q = await db();
  await q.run(`INSERT INTO tasks (id, user_id, subject_id, subject, title, kind, due_at, not_before, estimated_minutes, difficulty, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, userId, await subjectIdFor(q, userId, t.subject), t.subject, t.title.slice(0, 160), t.kind, t.dueAt, t.notBefore ?? null,
    Math.min(1200, Math.max(15, t.estimatedMinutes)), t.difficulty, t.priority]);
  return id;
}

export async function setTaskStatus(userId: string, id: string, status: Task['status']) {
  await run(`UPDATE tasks SET status = ?, completed_at = ${status === 'done' ? 'now()' : 'NULL'} WHERE id = ? AND user_id = ?`, [status, id, userId]);
}

export async function deleteTask(userId: string, id: string) {
  await run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
}

function rowToBlock(r: Row): StudyBlock {
  return {
    id: String(r.id), userId: String(r.user_id), taskId: String(r.task_id), startAt: String(r.starts_at), endAt: String(r.ends_at),
    status: String(r.status) as StudyBlock['status'], completedAt: str(r.completed_at), note: str(r.label),
  };
}

export async function listBlocks(userId: string, from?: string, to?: string): Promise<StudyBlock[]> {
  if (from && to) {
    return (await all('SELECT * FROM study_blocks WHERE user_id = ? AND starts_at < ? AND ends_at > ? ORDER BY starts_at', [userId, to, from])).map(rowToBlock);
  }
  return (await all('SELECT * FROM study_blocks WHERE user_id = ? ORDER BY starts_at', [userId])).map(rowToBlock);
}

export async function getBlock(userId: string, id: string): Promise<StudyBlock | null> {
  const r = await get('SELECT * FROM study_blocks WHERE id = ? AND user_id = ?', [id, userId]);
  return r ? rowToBlock(r) : null;
}

export async function insertBlocks(userId: string, blocks: { taskId: string; startAt: string; endAt: string; note?: string | null }[]) {
  if (!blocks.length) return;
  await (await db()).tx(async q => {
    for (const b of blocks) {
      await q.run('INSERT INTO study_blocks (user_id, task_id, starts_at, ends_at, label) VALUES (?, ?, ?, ?, ?)', [userId, b.taskId, b.startAt, b.endAt, b.note ?? null]);
    }
  });
}

export async function updateBlock(userId: string, id: string, patch: Partial<Pick<StudyBlock, 'startAt' | 'endAt' | 'status' | 'completedAt'>>) {
  const map: Record<string, string> = { startAt: 'starts_at', endAt: 'ends_at', status: 'status', completedAt: 'completed_at' };
  const sets: string[] = [];
  const vals: Param[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v as Param); }
  }
  if (sets.length) await run(`UPDATE study_blocks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, [...vals, id, userId]);
}

export async function deleteBlocks(userId: string, ids: string[]) {
  if (!ids.length) return;
  await (await db()).tx(async q => {
    for (const id of ids) await q.run('DELETE FROM study_blocks WHERE id = ? AND user_id = ?', [id, userId]);
  });
}

// =====================================================================
// connections & sync
// =====================================================================

function rowToConnection(r: Row): CalendarConnection {
  return {
    id: String(r.id), userId: String(r.user_id), provider: String(r.provider) as Provider,
    status: String(r.status) as CalendarConnection['status'], config: json(r.config, {}),
    lastSyncAt: str(r.last_sync_at), lastError: str(r.last_error), createdAt: String(r.created_at),
  };
}

export interface ConnectionSecrets { secretEnc: string | null; accessTokenEnc: string | null; refreshTokenEnc: string | null; tokenExpiresAt: string | null }

export async function listConnections(userId: string): Promise<CalendarConnection[]> {
  return (await all('SELECT * FROM calendar_connections WHERE user_id = ? ORDER BY created_at', [userId])).map(rowToConnection);
}

export async function listAllConnections(): Promise<{ userId: string; provider: Provider }[]> {
  return (await all("SELECT user_id, provider FROM calendar_connections WHERE status IN ('connected', 'error') AND provider <> 'apple'"))
    .map(r => ({ userId: String(r.user_id), provider: String(r.provider) as Provider }));
}

export async function listUserIds(): Promise<string[]> {
  return (await all('SELECT id FROM users')).map(r => String(r.id));
}

export async function getConnection(userId: string, provider: Provider): Promise<(CalendarConnection & ConnectionSecrets) | null> {
  const r = await get('SELECT * FROM calendar_connections WHERE user_id = ? AND provider = ?', [userId, provider]);
  if (!r) return null;
  return {
    ...rowToConnection(r), secretEnc: str(r.secret_enc), accessTokenEnc: str(r.access_token_enc),
    refreshTokenEnc: str(r.refresh_token_enc), tokenExpiresAt: str(r.token_expires_at),
  };
}

export async function findConnectionByLookup(lookupHash: string): Promise<(CalendarConnection & ConnectionSecrets) | null> {
  const r = await get("SELECT user_id, provider FROM calendar_connections WHERE lookup_hash = ? AND status = 'connected'", [lookupHash]);
  return r ? getConnection(String(r.user_id), String(r.provider) as Provider) : null;
}

export async function upsertConnection(userId: string, provider: Provider, data: Partial<ConnectionSecrets> & { status?: CalendarConnection['status']; config?: CalendarConnection['config']; lookupHash?: string | null }): Promise<string> {
  const existing = await getConnection(userId, provider);
  if (!existing) {
    const id = newId();
    await run(`INSERT INTO calendar_connections (id, user_id, provider, status, secret_enc, access_token_enc, refresh_token_enc, token_expires_at, lookup_hash, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, userId, provider, data.status ?? 'connected', data.secretEnc ?? null,
      data.accessTokenEnc ?? null, data.refreshTokenEnc ?? null, data.tokenExpiresAt ?? null, data.lookupHash ?? null, JSON.stringify(data.config ?? {})]);
    return id;
  }
  const sets: string[] = [];
  const vals: Param[] = [];
  const cols: Record<string, string> = { secretEnc: 'secret_enc', accessTokenEnc: 'access_token_enc', refreshTokenEnc: 'refresh_token_enc', tokenExpiresAt: 'token_expires_at', status: 'status', lookupHash: 'lookup_hash' };
  for (const [k, col] of Object.entries(cols)) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v as Param); }
  }
  if (data.config) { sets.push('config = ?'); vals.push(JSON.stringify({ ...existing.config, ...data.config })); }
  if (sets.length) await run(`UPDATE calendar_connections SET ${sets.join(', ')} WHERE id = ?`, [...vals, existing.id]);
  return existing.id;
}

export async function markConnectionSync(id: string, error: string | null) {
  await run('UPDATE calendar_connections SET last_sync_at = now(), last_error = ?, status = ? WHERE id = ?', [error, error ? 'error' : 'connected', id]);
}

/** Removes the connection; its calendars, their events and the sync mapping go with it (ON DELETE CASCADE). */
export async function deleteConnection(userId: string, provider: Provider) {
  await run('DELETE FROM calendar_connections WHERE user_id = ? AND provider = ?', [userId, provider]);
}

export interface SyncEntry { externalId: string; externalCalendarId: string; hash: string; startAt: string }

export async function getSyncMap(connectionId: string): Promise<Map<string, SyncEntry>> {
  const rows = await all('SELECT * FROM sync_mappings WHERE connection_id = ?', [connectionId]);
  return new Map(rows.map(r => [String(r.local_key), {
    externalId: String(r.external_id), externalCalendarId: String(r.external_calendar_id ?? ''), hash: String(r.content_hash), startAt: String(r.starts_at),
  }]));
}

export async function setSyncMap(connectionId: string, localKey: string, externalId: string, hash: string, startAt: string, externalCalendarId = '') {
  await run(`INSERT INTO sync_mappings (connection_id, local_key, external_id, external_calendar_id, content_hash, starts_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (connection_id, local_key) DO UPDATE SET external_id = excluded.external_id, external_calendar_id = excluded.external_calendar_id,
      content_hash = excluded.content_hash, starts_at = excluded.starts_at, updated_at = now()`,
  [connectionId, localKey, externalId, externalCalendarId, hash, startAt]);
}

export async function removeSyncMap(connectionId: string, localKey: string) {
  await run('DELETE FROM sync_mappings WHERE connection_id = ? AND local_key = ?', [connectionId, localKey]);
}

// =====================================================================
// suggestions
// =====================================================================

function rowToSuggestion(r: Row): Suggestion {
  return {
    id: String(r.id), userId: String(r.user_id), kind: String(r.kind) as Suggestion['kind'], message: String(r.message),
    payload: json(r.payload, {}), status: String(r.status) as Suggestion['status'], createdAt: String(r.created_at),
  };
}

export async function listOpenSuggestions(userId: string): Promise<Suggestion[]> {
  return (await all("SELECT * FROM suggestions WHERE user_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 10", [userId])).map(rowToSuggestion);
}

export async function getSuggestion(userId: string, id: string): Promise<Suggestion | null> {
  const r = await get('SELECT * FROM suggestions WHERE id = ? AND user_id = ?', [id, userId]);
  return r ? rowToSuggestion(r) : null;
}

/** Creates a suggestion unless one with the same dedupe key already exists. */
export async function addSuggestion(userId: string, kind: Suggestion['kind'], message: string, payload: Record<string, unknown>, dedupeKey?: string) {
  await run('INSERT INTO suggestions (user_id, kind, message, payload, dedupe_key) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    [userId, kind, message, JSON.stringify(payload), dedupeKey ?? null]);
}

export async function setSuggestionStatus(userId: string, id: string, status: Suggestion['status']) {
  await run(`UPDATE suggestions SET status = ?, resolved_at = ${status === 'open' ? 'NULL' : 'now()'} WHERE id = ? AND user_id = ?`, [status, id, userId]);
}

// =====================================================================
// cycle (sensitive health data: encrypted by the app)
// =====================================================================

export async function listCycleEntries(userId: string): Promise<CycleEntry[]> {
  const rows = await all('SELECT id, data_enc FROM cycle_entries WHERE user_id = ?', [userId]);
  return rows.map(r => ({ ...JSON.parse(decrypt(String(r.data_enc))), id: String(r.id) }) as CycleEntry)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function addCycleEntry(userId: string, entry: Omit<CycleEntry, 'id'>) {
  await run('INSERT INTO cycle_entries (user_id, data_enc) VALUES (?, ?)', [userId, encrypt(JSON.stringify(entry))]);
}

export async function deleteCycleEntry(userId: string, id: string) {
  await run('DELETE FROM cycle_entries WHERE id = ? AND user_id = ?', [id, userId]);
}

/** Granting consent enables the module; withdrawing it deletes every cycle entry. */
export async function setCycleConsent(userId: string, consent: boolean) {
  await (await db()).tx(async q => {
    if (consent) await q.run('UPDATE profiles SET cycle_consent_at = now(), cycle_enabled = true WHERE user_id = ?', [userId]);
    else {
      await q.run('UPDATE profiles SET cycle_enabled = false, cycle_in_calendar = false, cycle_consent_at = NULL WHERE user_id = ?', [userId]);
      await q.run('DELETE FROM cycle_entries WHERE user_id = ?', [userId]);
    }
  });
}

export async function hasCycleConsent(userId: string): Promise<boolean> {
  const r = await get('SELECT cycle_consent_at FROM profiles WHERE user_id = ?', [userId]);
  return Boolean(r?.cycle_consent_at);
}

// =====================================================================
// vault, AI log, chat
// =====================================================================

export interface VaultFile { path: string; content: string; updatedBy: 'user' | 'ai' | 'system'; updatedAt: string }

const rowToVault = (r: Row): VaultFile => ({
  path: String(r.path), content: String(r.content ?? ''), updatedBy: String(r.updated_by) as VaultFile['updatedBy'], updatedAt: String(r.updated_at),
});

export async function listVaultFiles(userId: string): Promise<VaultFile[]> {
  return (await all('SELECT path, content, updated_by, updated_at FROM vault_files WHERE user_id = ? ORDER BY path', [userId])).map(rowToVault);
}

export async function getVaultFile(userId: string, path: string): Promise<VaultFile | null> {
  const r = await get('SELECT path, content, updated_by, updated_at FROM vault_files WHERE user_id = ? AND path = ?', [userId, path]);
  return r ? rowToVault(r) : null;
}

export async function writeVaultFile(userId: string, path: string, content: string, by: VaultFile['updatedBy']) {
  await run(`INSERT INTO vault_files (user_id, path, content, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, path) DO UPDATE SET content = excluded.content, updated_by = excluded.updated_by`,
  [userId, path, content.slice(0, 100000), by]);
}

export async function deleteVaultFile(userId: string, path: string) {
  await run('DELETE FROM vault_files WHERE user_id = ? AND path = ?', [userId, path]);
}

export async function searchVault(userId: string, query: string): Promise<VaultFile[]> {
  const like = `%${query.replace(/[%_\\]/g, m => `\\${m}`)}%`;
  return (await all(`SELECT path, content, updated_by, updated_at FROM vault_files WHERE user_id = ? AND (path ILIKE ? OR content ILIKE ?)
    ORDER BY updated_at DESC LIMIT 10`, [userId, like, like])).map(rowToVault);
}

export async function logAiAction(userId: string, tool: string, summary: string) {
  await run('INSERT INTO ai_actions (user_id, tool, summary) VALUES (?, ?, ?)', [userId, tool, summary.slice(0, 500)]);
}

export async function listAiActions(userId: string, limit = 100): Promise<{ tool: string; summary: string; createdAt: string }[]> {
  return (await all('SELECT tool, summary, created_at FROM ai_actions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]))
    .map(r => ({ tool: String(r.tool), summary: String(r.summary), createdAt: String(r.created_at) }));
}

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }

export interface ChatThread { id: string; title: string; updatedAt: string }

/** Messages from before chat history existed (thread_id NULL) become one "Früherer Chat". */
async function adoptLegacyChat(userId: string) {
  const legacy = await get('SELECT count(*)::int AS n, min(created_at) AS first, max(created_at) AS last FROM chat_messages WHERE user_id = ? AND thread_id IS NULL', [userId]);
  if (!legacy || !Number(legacy.n)) return;
  const id = newId();
  await (await db()).tx(async q => {
    await q.run('INSERT INTO chat_threads (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, userId, 'Früherer Chat', String(legacy.first), String(legacy.last)]);
    await q.run('UPDATE chat_messages SET thread_id = ? WHERE user_id = ? AND thread_id IS NULL', [id, userId]);
  });
}

export async function listThreads(userId: string, limit = 60): Promise<ChatThread[]> {
  await adoptLegacyChat(userId);
  return (await all('SELECT id, title, updated_at FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?', [userId, limit]))
    .map(r => ({ id: String(r.id), title: String(r.title), updatedAt: String(r.updated_at) }));
}

export async function getThread(userId: string, id: string): Promise<ChatThread | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await get('SELECT id, title, updated_at FROM chat_threads WHERE id = ? AND user_id = ?', [id, userId]);
  return r ? { id: String(r.id), title: String(r.title), updatedAt: String(r.updated_at) } : null;
}

export async function createThread(userId: string, title: string): Promise<string> {
  const id = newId();
  await run('INSERT INTO chat_threads (id, user_id, title) VALUES (?, ?, ?)', [id, userId, title.trim().slice(0, 80) || 'Neuer Chat']);
  return id;
}

export async function deleteThread(userId: string, id: string) {
  await run('DELETE FROM chat_threads WHERE id = ? AND user_id = ?', [id, userId]); // messages cascade
}

/** Last `limit` messages of a conversation, oldest first. */
export async function listChat(userId: string, threadId: string, limit = 60): Promise<ChatMessage[]> {
  const rows = await all('SELECT id, role, content, created_at FROM chat_messages WHERE user_id = ? AND thread_id = ? ORDER BY created_at DESC LIMIT ?', [userId, threadId, limit]);
  return rows.reverse().map(r => ({ id: String(r.id), role: String(r.role) as ChatMessage['role'], content: String(r.content), createdAt: String(r.created_at) }));
}

export async function addChat(userId: string, threadId: string, role: ChatMessage['role'], content: string) {
  await run('INSERT INTO chat_messages (user_id, thread_id, role, content) VALUES (?, ?, ?, ?)', [userId, threadId, role, content.slice(0, 8000)]);
  await run('UPDATE chat_threads SET updated_at = now() WHERE id = ? AND user_id = ?', [threadId, userId]);
}

// =====================================================================
// GDPR export (no password hash, no tokens)
// =====================================================================

export async function exportUserData(userId: string) {
  const q = (sql: string) => all(sql, [userId]);
  return {
    exportedAt: nowIso(),
    profile: await getUser(userId),
    calendars: await q('SELECT id, name, color, kind, is_visible, is_writable, created_at FROM calendars WHERE user_id = ?'),
    events: await q('SELECT * FROM events WHERE user_id = ?'),
    timetable: await q('SELECT * FROM timetable_entries WHERE user_id = ?'),
    schoolHolidays: await q('SELECT * FROM school_holidays WHERE user_id = ?'),
    tasks: await q('SELECT * FROM tasks WHERE user_id = ?'),
    studyBlocks: await q('SELECT * FROM study_blocks WHERE user_id = ?'),
    calendarConnections: await q('SELECT id, provider, status, config, last_sync_at, created_at FROM calendar_connections WHERE user_id = ?'),
    suggestions: await q('SELECT * FROM suggestions WHERE user_id = ?'),
    vault: await q('SELECT path, content, updated_by, updated_at FROM vault_files WHERE user_id = ?'),
    aiActions: await q('SELECT tool, summary, created_at FROM ai_actions WHERE user_id = ?'),
    chatThreads: await q('SELECT id, title, created_at FROM chat_threads WHERE user_id = ?'),
    chat: await q('SELECT thread_id, role, content, created_at FROM chat_messages WHERE user_id = ?'),
    cycleEntries: (await hasCycleConsent(userId)) ? await listCycleEntries(userId) : [],
  };
}
