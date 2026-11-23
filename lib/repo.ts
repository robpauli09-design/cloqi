import 'server-only';
import { db, newId, nowIso, tx } from './db';
import { decrypt, encrypt } from './crypto';
import {
  DEFAULT_PREFS, type CalendarConnection, type CalendarEvent, type CalendarKind, type Category, type CycleEntry, type Prefs, type Provider,
  type StudyBlock, type Suggestion, type Task, type TimetableEntry, type User, type UserCalendar,
} from './types';

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const json = <T>(v: unknown, fallback: T): T => { try { return v ? JSON.parse(String(v)) as T : fallback; } catch { return fallback; } };

// ---------- users ----------

export function rowToUser(r: Row): User {
  return {
    id: String(r.id), email: String(r.email), name: String(r.name ?? ''),
    userType: (str(r.user_type) as User['userType']) ?? null,
    timezone: String(r.timezone), onboarded: Number(r.onboarded) === 1,
    lifeAreas: json<string[]>(r.life_areas, []),
    prefs: { ...DEFAULT_PREFS, ...json<Partial<Prefs>>(r.prefs, {}) },
    createdAt: String(r.created_at),
  };
}

export function findUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const r = db().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as Row | undefined;
  return r ? { ...rowToUser(r), passwordHash: String(r.password_hash) } : null;
}

export function getUser(id: string): User | null {
  const r = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToUser(r) : null;
}

export function createUser(email: string, passwordHash: string, timezone: string): User {
  const id = newId();
  db().prepare('INSERT INTO users (id, email, password_hash, timezone, prefs, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, email.toLowerCase(), passwordHash, timezone, JSON.stringify(DEFAULT_PREFS), nowIso());
  return getUser(id)!;
}

export function updateUser(id: string, patch: Partial<Pick<User, 'name' | 'userType' | 'timezone' | 'onboarded' | 'lifeAreas' | 'prefs'>>) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
  if (patch.userType !== undefined) { sets.push('user_type = ?'); vals.push(patch.userType); }
  if (patch.timezone !== undefined) { sets.push('timezone = ?'); vals.push(patch.timezone); }
  if (patch.onboarded !== undefined) { sets.push('onboarded = ?'); vals.push(patch.onboarded ? 1 : 0); }
  if (patch.lifeAreas !== undefined) { sets.push('life_areas = ?'); vals.push(JSON.stringify(patch.lifeAreas)); }
  if (patch.prefs !== undefined) { sets.push('prefs = ?'); vals.push(JSON.stringify(patch.prefs)); }
  if (!sets.length) return;
  db().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
}

export function deleteUser(id: string) {
  db().prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ---------- calendars ----------

function rowToCalendar(r: Row): UserCalendar {
  return {
    id: String(r.id), userId: String(r.user_id), name: String(r.name), color: String(r.color), kind: String(r.kind) as CalendarKind,
    connectionId: str(r.connection_id), externalId: str(r.external_id), visible: Number(r.visible) === 1, writable: Number(r.writable) === 1,
  };
}

export const DEFAULT_CALENDARS: { name: string; color: string; kind: CalendarKind; writable: boolean }[] = [
  { name: 'CLOQI', color: '#7CC51B', kind: 'cloqi', writable: true },
  { name: 'Lernplan', color: '#A4D92D', kind: 'study', writable: true },
  { name: 'Stundenplan', color: '#286B24', kind: 'timetable', writable: true },
];

export function listCalendars(userId: string): UserCalendar[] {
  const rows = db().prepare('SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at').all(userId) as Row[];
  if (rows.some(r => r.kind === 'cloqi')) return rows.map(rowToCalendar);
  // first access: create the built-in calendars
  const stmt = db().prepare('INSERT INTO calendars (id, user_id, name, color, kind, writable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  tx(() => {
    DEFAULT_CALENDARS.forEach((c, i) => {
      if (!rows.some(r => r.kind === c.kind)) stmt.run(newId(), userId, c.name, c.color, c.kind, c.writable ? 1 : 0, new Date(Date.now() - 1000 + i).toISOString());
    });
  });
  return (db().prepare('SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at').all(userId) as Row[]).map(rowToCalendar);
}

export function calendarOfKind(userId: string, kind: CalendarKind): UserCalendar {
  const found = listCalendars(userId).find(c => c.kind === kind);
  if (found) return found;
  const fallback: Partial<Record<CalendarKind, { name: string; color: string; writable: boolean }>> = {
    ics: { name: 'Importierte Termine', color: '#5B6472', writable: true },
    webuntis: { name: 'WebUntis', color: '#286B24', writable: false },
  };
  const def = DEFAULT_CALENDARS.find(c => c.kind === kind) ?? { kind, ...(fallback[kind] ?? { name: 'Kalender', color: '#5B6472', writable: true }) };
  return getCalendar(userId, createCalendar(userId, { name: def.name, color: def.color, kind, writable: def.writable }))!;
}

export function getCalendar(userId: string, id: string): UserCalendar | null {
  const r = db().prepare('SELECT * FROM calendars WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? rowToCalendar(r) : null;
}

export function createCalendar(userId: string, c: { name: string; color: string; kind: CalendarKind; connectionId?: string | null; externalId?: string | null; writable?: boolean }): string {
  const id = newId();
  db().prepare('INSERT INTO calendars (id, user_id, name, color, kind, connection_id, external_id, writable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, c.name, c.color, c.kind, c.connectionId ?? null, c.externalId ?? null, c.writable === false ? 0 : 1, nowIso());
  return id;
}

export function updateCalendar(userId: string, id: string, patch: Partial<Pick<UserCalendar, 'name' | 'color' | 'visible'>>) {
  if (patch.name !== undefined) db().prepare('UPDATE calendars SET name = ? WHERE id = ? AND user_id = ?').run(patch.name, id, userId);
  if (patch.color !== undefined) db().prepare('UPDATE calendars SET color = ? WHERE id = ? AND user_id = ?').run(patch.color, id, userId);
  if (patch.visible !== undefined) db().prepare('UPDATE calendars SET visible = ? WHERE id = ? AND user_id = ?').run(patch.visible ? 1 : 0, id, userId);
}

export function deleteCalendar(userId: string, id: string) {
  db().prepare('DELETE FROM calendars WHERE id = ? AND user_id = ?').run(id, userId);
}

export function calendarsForConnection(userId: string, connectionId: string): UserCalendar[] {
  return (db().prepare('SELECT * FROM calendars WHERE user_id = ? AND connection_id = ?').all(userId, connectionId) as Row[]).map(rowToCalendar);
}

// ---------- events ----------

function rowToEvent(r: Row): CalendarEvent {
  return {
    id: String(r.id), userId: String(r.user_id), calendarId: str(r.calendar_id), title: String(r.title), description: str(r.description),
    startAt: String(r.start_at), endAt: String(r.end_at), allDay: Number(r.all_day) === 1,
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
export function listEvents(userId: string, from: string, to: string): CalendarEvent[] {
  const rows = db().prepare(`
    SELECT * FROM events WHERE user_id = ? AND (
      (recurrence_freq IS NULL AND start_at < ? AND end_at > ?) OR
      (recurrence_freq IS NOT NULL AND start_at < ? AND (recurrence_until IS NULL OR recurrence_until >= ?))
    ) ORDER BY start_at`).all(userId, to, from, to, from.slice(0, 10)) as Row[];
  return rows.map(rowToEvent);
}

export function getEvent(userId: string, id: string): CalendarEvent | null {
  const r = db().prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? rowToEvent(r) : null;
}

export interface EventInput {
  title: string; description?: string | null; startAt: string; endAt: string; allDay?: boolean; calendarId?: string | null;
  category: Category; source?: CalendarEvent['source']; externalUid?: string | null; connectionId?: string | null;
  status?: CalendarEvent['status']; location?: string | null; teacher?: string | null; reminderMinutes?: number | null;
  recurrenceFreq?: CalendarEvent['recurrenceFreq']; recurrenceInterval?: number; recurrenceUntil?: string | null;
  exdates?: string[]; seriesId?: string | null; syncState?: CalendarEvent['syncState']; remoteVersion?: string | null;
}

export function createEvent(userId: string, e: EventInput): string {
  const id = newId();
  const now = nowIso();
  db().prepare(`INSERT INTO events (id, user_id, calendar_id, title, description, start_at, end_at, all_day, category, source, external_uid,
    connection_id, status, location, teacher, reminder_minutes, recurrence_freq, recurrence_interval, recurrence_until, exdates, series_id,
    sync_state, remote_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, userId, e.calendarId ?? null, e.title, e.description ?? null, e.startAt, e.endAt, e.allDay ? 1 : 0, e.category, e.source ?? 'manual',
    e.externalUid ?? null, e.connectionId ?? null, e.status ?? 'active', e.location ?? null, e.teacher ?? null,
    e.reminderMinutes ?? null, e.recurrenceFreq ?? null, e.recurrenceInterval ?? 1, e.recurrenceUntil ?? null,
    JSON.stringify(e.exdates ?? []), e.seriesId ?? null, e.syncState ?? 'clean', e.remoteVersion ?? null, now, now);
  return id;
}

const EVENT_COLUMNS: Record<string, string> = {
  title: 'title', description: 'description', startAt: 'start_at', endAt: 'end_at', category: 'category', status: 'status',
  location: 'location', teacher: 'teacher', reminderMinutes: 'reminder_minutes', recurrenceFreq: 'recurrence_freq',
  recurrenceInterval: 'recurrence_interval', recurrenceUntil: 'recurrence_until', calendarId: 'calendar_id', seriesId: 'series_id',
  syncState: 'sync_state', remoteVersion: 'remote_version', externalUid: 'external_uid',
};

export function updateEvent(userId: string, id: string, e: Partial<EventInput>) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, col] of Object.entries(EVENT_COLUMNS)) {
    const v = (e as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v as string | number | null); }
  }
  if (e.allDay !== undefined) { sets.push('all_day = ?'); vals.push(e.allDay ? 1 : 0); }
  if (e.exdates !== undefined) { sets.push('exdates = ?'); vals.push(JSON.stringify(e.exdates)); }
  if (!sets.length) return;
  sets.push('updated_at = ?'); vals.push(nowIso());
  db().prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
}

export function deleteEvent(userId: string, id: string) {
  db().prepare('DELETE FROM events WHERE (id = ? OR series_id = ?) AND user_id = ?').run(id, id, userId);
}

export function eventsBySource(userId: string, source: string): CalendarEvent[] {
  return (db().prepare('SELECT * FROM events WHERE user_id = ? AND source = ?').all(userId, source) as Row[]).map(rowToEvent);
}

export function eventsByConnection(userId: string, connectionId: string): CalendarEvent[] {
  return (db().prepare('SELECT * FROM events WHERE user_id = ? AND connection_id = ?').all(userId, connectionId) as Row[]).map(rowToEvent);
}

// ---------- timetable ----------

function rowToEntry(r: Row): TimetableEntry {
  return {
    id: String(r.id), userId: String(r.user_id), source: String(r.source) as TimetableEntry['source'],
    subject: String(r.subject), teacher: str(r.teacher), room: str(r.room), institution: str(r.institution),
    weekday: Number(r.weekday), startTime: String(r.start_time), endTime: String(r.end_time), exdates: json<string[]>(r.exdates, []),
  };
}

export function listTimetable(userId: string): TimetableEntry[] {
  return (db().prepare('SELECT * FROM timetable_entries WHERE user_id = ? ORDER BY weekday, start_time').all(userId) as Row[]).map(rowToEntry);
}

export function addTimetableEntry(userId: string, e: Omit<TimetableEntry, 'id' | 'userId' | 'exdates'>): string {
  const id = newId();
  db().prepare(`INSERT INTO timetable_entries (id, user_id, source, subject, teacher, room, institution, weekday, start_time, end_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, e.source, e.subject, e.teacher, e.room, e.institution, e.weekday, e.startTime, e.endTime, nowIso());
  return id;
}

export function setTimetableExdates(userId: string, id: string, exdates: string[]) {
  db().prepare('UPDATE timetable_entries SET exdates = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(exdates), id, userId);
}

export function getTimetableEntry(userId: string, id: string): TimetableEntry | null {
  const r = db().prepare('SELECT * FROM timetable_entries WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? rowToEntry(r) : null;
}

export function deleteTimetableEntry(userId: string, id: string) {
  db().prepare('DELETE FROM timetable_entries WHERE id = ? AND user_id = ?').run(id, userId);
}

export interface TimetableBreak { id: string; name: string; startDate: string; endDate: string }

export function listBreaks(userId: string): TimetableBreak[] {
  return (db().prepare('SELECT * FROM timetable_breaks WHERE user_id = ? ORDER BY start_date').all(userId) as Row[])
    .map(r => ({ id: String(r.id), name: String(r.name), startDate: String(r.start_date), endDate: String(r.end_date) }));
}

export function addBreak(userId: string, name: string, startDate: string, endDate: string) {
  db().prepare('INSERT INTO timetable_breaks (id, user_id, name, start_date, end_date) VALUES (?, ?, ?, ?, ?)').run(newId(), userId, name, startDate, endDate);
}

export function deleteBreak(userId: string, id: string) {
  db().prepare('DELETE FROM timetable_breaks WHERE id = ? AND user_id = ?').run(id, userId);
}

// ---------- tasks & study blocks ----------

function rowToTask(r: Row): Task {
  return {
    id: String(r.id), userId: String(r.user_id), title: String(r.title), subject: String(r.subject),
    kind: String(r.kind) as Task['kind'], dueAt: String(r.due_at), estimatedMinutes: Number(r.estimated_minutes),
    difficulty: Number(r.difficulty) as Task['difficulty'], status: String(r.status) as Task['status'],
    priority: Number(r.priority) as Task['priority'], notBefore: str(r.not_before), createdAt: String(r.created_at),
  };
}

export function listTasks(userId: string, opts: { openOnly?: boolean } = {}): Task[] {
  const sql = `SELECT * FROM tasks WHERE user_id = ? ${opts.openOnly ? "AND status = 'open'" : ''} ORDER BY due_at`;
  return (db().prepare(sql).all(userId) as Row[]).map(rowToTask);
}

export function getTask(userId: string, id: string): Task | null {
  const r = db().prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? rowToTask(r) : null;
}

export function createTask(userId: string, t: Omit<Task, 'id' | 'userId' | 'createdAt' | 'status' | 'notBefore'> & { notBefore?: string | null }): string {
  const id = newId();
  db().prepare(`INSERT INTO tasks (id, user_id, title, subject, kind, due_at, estimated_minutes, difficulty, priority, not_before, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, t.title, t.subject, t.kind, t.dueAt, t.estimatedMinutes, t.difficulty, t.priority, t.notBefore ?? null, nowIso());
  return id;
}

export function setTaskStatus(userId: string, id: string, status: Task['status']) {
  db().prepare('UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?').run(status, id, userId);
}

export function deleteTask(userId: string, id: string) {
  db().prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, userId);
}

function rowToBlock(r: Row): StudyBlock {
  return {
    id: String(r.id), userId: String(r.user_id), taskId: String(r.task_id), startAt: String(r.start_at), endAt: String(r.end_at),
    status: String(r.status) as StudyBlock['status'], completedAt: str(r.completed_at), note: str(r.note),
  };
}

export function listBlocks(userId: string, from?: string, to?: string): StudyBlock[] {
  if (from && to) {
    return (db().prepare('SELECT * FROM study_blocks WHERE user_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at').all(userId, to, from) as Row[]).map(rowToBlock);
  }
  return (db().prepare('SELECT * FROM study_blocks WHERE user_id = ? ORDER BY start_at').all(userId) as Row[]).map(rowToBlock);
}

export function getBlock(userId: string, id: string): StudyBlock | null {
  const r = db().prepare('SELECT * FROM study_blocks WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? rowToBlock(r) : null;
}

export function insertBlocks(userId: string, blocks: { taskId: string; startAt: string; endAt: string; note?: string | null }[]) {
  const stmt = db().prepare('INSERT INTO study_blocks (id, user_id, task_id, start_at, end_at, note) VALUES (?, ?, ?, ?, ?, ?)');
  tx(() => { for (const b of blocks) stmt.run(newId(), userId, b.taskId, b.startAt, b.endAt, b.note ?? null); });
}

export function updateBlock(userId: string, id: string, patch: Partial<Pick<StudyBlock, 'startAt' | 'endAt' | 'status' | 'completedAt'>>) {
  const map: Record<string, string> = { startAt: 'start_at', endAt: 'end_at', status: 'status', completedAt: 'completed_at' };
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v as string | null); }
  }
  if (sets.length) db().prepare(`UPDATE study_blocks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
}

export function deleteBlocks(userId: string, ids: string[]) {
  const stmt = db().prepare('DELETE FROM study_blocks WHERE id = ? AND user_id = ?');
  tx(() => { for (const id of ids) stmt.run(id, userId); });
}

// ---------- connections ----------

function rowToConnection(r: Row): CalendarConnection {
  return {
    id: String(r.id), userId: String(r.user_id), provider: String(r.provider) as Provider,
    status: String(r.status) as CalendarConnection['status'], config: json(r.config, {}),
    lastSyncAt: str(r.last_sync_at), lastError: str(r.last_error), createdAt: String(r.created_at),
  };
}

export interface ConnectionSecrets { secretEnc: string | null; accessTokenEnc: string | null; refreshTokenEnc: string | null; tokenExpiresAt: string | null }

export function listConnections(userId: string): CalendarConnection[] {
  return (db().prepare('SELECT * FROM calendar_connections WHERE user_id = ? ORDER BY created_at').all(userId) as Row[]).map(rowToConnection);
}

export function getConnection(userId: string, provider: Provider): (CalendarConnection & ConnectionSecrets) | null {
  const r = db().prepare('SELECT * FROM calendar_connections WHERE user_id = ? AND provider = ?').get(userId, provider) as Row | undefined;
  if (!r) return null;
  return {
    ...rowToConnection(r), secretEnc: str(r.secret_enc), accessTokenEnc: str(r.access_token_enc),
    refreshTokenEnc: str(r.refresh_token_enc), tokenExpiresAt: str(r.token_expires_at),
  };
}

export function findConnectionByLookup(lookupHash: string): (CalendarConnection & ConnectionSecrets) | null {
  const r = db().prepare("SELECT * FROM calendar_connections WHERE lookup_hash = ? AND status = 'connected'").get(lookupHash) as Row | undefined;
  return r ? getConnection(String(r.user_id), String(r.provider) as Provider) : null;
}

export function upsertConnection(userId: string, provider: Provider, data: Partial<ConnectionSecrets> & { status?: CalendarConnection['status']; config?: CalendarConnection['config']; lookupHash?: string | null }): string {
  const existing = getConnection(userId, provider);
  if (!existing) {
    const id = newId();
    db().prepare(`INSERT INTO calendar_connections (id, user_id, provider, status, secret_enc, access_token_enc, refresh_token_enc, token_expires_at, lookup_hash, config, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, provider, data.status ?? 'connected', data.secretEnc ?? null,
      data.accessTokenEnc ?? null, data.refreshTokenEnc ?? null, data.tokenExpiresAt ?? null, data.lookupHash ?? null,
      JSON.stringify(data.config ?? {}), nowIso());
    return id;
  }
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  const cols: Record<string, string> = { secretEnc: 'secret_enc', accessTokenEnc: 'access_token_enc', refreshTokenEnc: 'refresh_token_enc', tokenExpiresAt: 'token_expires_at', status: 'status', lookupHash: 'lookup_hash' };
  for (const [k, col] of Object.entries(cols)) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v as string | null); }
  }
  if (data.config) { sets.push('config = ?'); vals.push(JSON.stringify({ ...existing.config, ...data.config })); }
  if (sets.length) db().prepare(`UPDATE calendar_connections SET ${sets.join(', ')} WHERE id = ?`).run(...vals, existing.id);
  return existing.id;
}

export function markConnectionSync(id: string, error: string | null) {
  db().prepare('UPDATE calendar_connections SET last_sync_at = ?, last_error = ?, status = ? WHERE id = ?')
    .run(nowIso(), error, error ? 'error' : 'connected', id);
}

/** Removes the connection, its sync mapping and every event it imported. */
export function deleteConnection(userId: string, provider: Provider) {
  const c = getConnection(userId, provider);
  if (!c) return;
  tx(() => {
    db().prepare('DELETE FROM events WHERE user_id = ? AND connection_id = ?').run(userId, c.id);
    db().prepare('DELETE FROM calendars WHERE user_id = ? AND connection_id = ?').run(userId, c.id);
    db().prepare('DELETE FROM calendar_connections WHERE id = ?').run(c.id);
  });
}

// ---------- sync map ----------

export interface SyncEntry { externalId: string; externalCalendarId: string; hash: string; startAt: string }

export function getSyncMap(connectionId: string): Map<string, SyncEntry> {
  const rows = db().prepare('SELECT * FROM sync_map WHERE connection_id = ?').all(connectionId) as Row[];
  return new Map(rows.map(r => [String(r.local_key), {
    externalId: String(r.external_id), externalCalendarId: String(r.external_calendar_id ?? ''), hash: String(r.content_hash), startAt: String(r.start_at),
  }]));
}

export function setSyncMap(connectionId: string, localKey: string, externalId: string, hash: string, startAt: string, externalCalendarId = '') {
  db().prepare(`INSERT INTO sync_map (connection_id, local_key, external_id, external_calendar_id, content_hash, start_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(connection_id, local_key) DO UPDATE SET external_id = excluded.external_id, external_calendar_id = excluded.external_calendar_id,
      content_hash = excluded.content_hash, start_at = excluded.start_at, updated_at = excluded.updated_at`)
    .run(connectionId, localKey, externalId, externalCalendarId, hash, startAt, nowIso());
}

export function removeSyncMap(connectionId: string, localKey: string) {
  db().prepare('DELETE FROM sync_map WHERE connection_id = ? AND local_key = ?').run(connectionId, localKey);
}

// ---------- suggestions ----------

function rowToSuggestion(r: Row): Suggestion {
  return {
    id: String(r.id), userId: String(r.user_id), kind: String(r.kind) as Suggestion['kind'], message: String(r.message),
    payload: json(r.payload, {}), status: String(r.status) as Suggestion['status'], createdAt: String(r.created_at),
  };
}

export function listOpenSuggestions(userId: string): Suggestion[] {
  return (db().prepare("SELECT * FROM suggestions WHERE user_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 10").all(userId) as Row[]).map(rowToSuggestion);
}

export function getSuggestion(userId: string, id: string): Suggestion | null {
  const r = db().prepare('SELECT * FROM suggestions WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? rowToSuggestion(r) : null;
}

/** Creates a suggestion unless one with the same dedupe key already exists. */
export function addSuggestion(userId: string, kind: Suggestion['kind'], message: string, payload: Record<string, unknown>, dedupeKey?: string) {
  db().prepare(`INSERT OR IGNORE INTO suggestions (id, user_id, kind, message, payload, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), userId, kind, message, JSON.stringify(payload), dedupeKey ?? null, nowIso());
}

export function setSuggestionStatus(userId: string, id: string, status: Suggestion['status']) {
  db().prepare('UPDATE suggestions SET status = ? WHERE id = ? AND user_id = ?').run(status, id, userId);
}

// ---------- cycle (sensitive health data: stored encrypted) ----------

export function listCycleEntries(userId: string): CycleEntry[] {
  const rows = db().prepare('SELECT * FROM cycle_entries WHERE user_id = ?').all(userId) as Row[];
  return rows.map(r => ({ ...JSON.parse(decrypt(String(r.data_enc))), id: String(r.id) }) as CycleEntry)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function addCycleEntry(userId: string, entry: Omit<CycleEntry, 'id'>) {
  db().prepare('INSERT INTO cycle_entries (id, user_id, data_enc, created_at) VALUES (?, ?, ?, ?)').run(newId(), userId, encrypt(JSON.stringify(entry)), nowIso());
}

export function deleteCycleEntry(userId: string, id: string) {
  db().prepare('DELETE FROM cycle_entries WHERE id = ? AND user_id = ?').run(id, userId);
}

/** Granting consent enables the module; withdrawing it deletes every cycle entry. */
export function setCycleConsent(userId: string, consent: boolean) {
  db().prepare('UPDATE users SET cycle_consent_at = ? WHERE id = ?').run(consent ? nowIso() : null, userId);
  if (!consent) db().prepare('DELETE FROM cycle_entries WHERE user_id = ?').run(userId);
}

export function hasCycleConsent(userId: string): boolean {
  const r = db().prepare('SELECT cycle_consent_at FROM users WHERE id = ?').get(userId) as Row | undefined;
  return Boolean(r?.cycle_consent_at);
}

// ---------- export ----------

export function exportUserData(userId: string) {
  const q = (sql: string) => db().prepare(sql).all(userId);
  const user = getUser(userId);
  return {
    exportedAt: nowIso(),
    profile: user,
    timetable: q('SELECT * FROM timetable_entries WHERE user_id = ?'),
    events: q('SELECT * FROM events WHERE user_id = ?'),
    tasks: q('SELECT * FROM tasks WHERE user_id = ?'),
    studyBlocks: q('SELECT * FROM study_blocks WHERE user_id = ?'),
    calendars: q('SELECT * FROM calendars WHERE user_id = ?'),
    timetableBreaks: q('SELECT * FROM timetable_breaks WHERE user_id = ?'),
    calendarConnections: q('SELECT id, provider, status, config, last_sync_at, created_at FROM calendar_connections WHERE user_id = ?'),
    cycleEntries: hasCycleConsent(userId) ? listCycleEntries(userId) : [],
    suggestions: q('SELECT * FROM suggestions WHERE user_id = ?'),
  };
}
