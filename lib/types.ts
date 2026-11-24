export type UserType = 'schueler' | 'student' | 'lehrer' | 'berufstaetig' | 'sonstiges';

export type Gender = 'm' | 'w' | 'd';
export const GENDER_LABELS: Record<Gender, string> = { m: 'Männlich', w: 'Weiblich', d: 'Divers' };
/** The companion follows the gender: Cloki for m, Clea for w; with d (or not set) the user chooses. */
export const mascotFor = (gender: Gender | null | undefined, chosen: 'cloki' | 'clea'): 'cloki' | 'clea' =>
  gender === 'm' ? 'cloki' : gender === 'w' ? 'clea' : chosen;
/** The Cycle module is offered to female and diverse users (and to anyone who already uses it). */
export const cycleAvailable = (u: { gender: Gender | null; prefs: { cycleEnabled: boolean } }) => u.gender !== 'm' || u.prefs.cycleEnabled;

export const USER_TYPE_LABELS: Record<UserType, string> = {
  schueler: 'Schüler/in',
  student: 'Student/in',
  lehrer: 'Lehrer/in',
  berufstaetig: 'Berufstätig',
  sonstiges: 'Sonstiges',
};

export type Category =
  | 'schule' | 'lernen' | 'pruefung' | 'hausuebung'
  | 'training' | 'arbeit' | 'freizeit' | 'privat';

export const CATEGORIES: Category[] = ['schule', 'lernen', 'pruefung', 'hausuebung', 'training', 'arbeit', 'freizeit', 'privat'];

/**
 * Calendar highlights (same rule in the app: mobile/src/theme.ts itemMark):
 *  exam      – Test, Schularbeit, Prüfung (Learn deadlines, events in "Prüfung", WebUntis exams) → red
 *  cancelled – lesson/event that does not take place (Entfall) → orange with stripes
 */
export type ItemMark = 'exam' | 'cancelled' | null;
export function itemMark(i: { category: string; status: string }): ItemMark {
  if (i.status === 'cancelled') return 'cancelled';
  if (i.category === 'pruefung' && i.status !== 'done') return 'exam';
  return null;
}
export const MARK_STYLE = {
  exam: { label: 'Test', color: '#E5484D', soft: '#FCE4E4', text: '#A8262B' },
  cancelled: { label: 'Entfall', color: '#F08C2E', soft: '#FDEBD8', text: '#A55912' },
} as const;
/** Diagonal stripes for cancelled items. */
export const CANCELLED_BG = 'repeating-linear-gradient(135deg, #FDEBD8 0 6px, #FFF6EC 6px 12px)';

export const CATEGORY_META: Record<Category, { label: string; color: string; soft: string; text: string }> = {
  schule:     { label: 'Schule / Uni',  color: '#286B24', soft: '#E3EFE1', text: '#1E5A1B' },
  lernen:     { label: 'Lernen',        color: '#7CC51B', soft: '#EDF6E3', text: '#3D6B0B' },
  pruefung:   { label: 'Prüfung',       color: '#E5484D', soft: '#FCE4E4', text: '#A8262B' },
  hausuebung: { label: 'Hausübung',     color: '#F08C2E', soft: '#FDEBD8', text: '#A55912' },
  training:   { label: 'Training',      color: '#1FA59A', soft: '#DDF3F1', text: '#13706A' },
  arbeit:     { label: 'Arbeit',        color: '#9A7B4F', soft: '#F3EBDD', text: '#6B5233' },
  freizeit:   { label: 'Freizeit',      color: '#E06A9E', soft: '#FBE5EF', text: '#A33A69' },
  privat:     { label: 'Privat',        color: '#5B6472', soft: '#E9EBEE', text: '#3B424D' },
};

export interface Subject { name: string; difficulty: 1 | 2 | 3 }

export interface Prefs {
  studyStart: string;        // weekday earliest study time, HH:MM
  studyEnd: string;          // weekday latest end of study, HH:MM
  weekendStart: string;
  weekendEnd: string;
  studyOnSunday: boolean;
  maxStudyPerDay: number;    // minutes
  blockMax: number;          // max minutes per block
  breakMin: number;          // buffer around fixed appointments
  dailyGoalMin: number;      // minutes of study per day for the daily goal
  reminderDefault: number;   // minutes before
  subjects: Subject[];
  mascot: 'cloki' | 'clea';
  cycleEnabled: boolean;
  cycleInCalendar: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  studyStart: '15:00',
  studyEnd: '20:30',
  weekendStart: '10:00',
  weekendEnd: '18:00',
  studyOnSunday: false,
  maxStudyPerDay: 120,
  blockMax: 60,
  breakMin: 15,
  dailyGoalMin: 45,
  reminderDefault: 15,
  subjects: [],
  mascot: 'cloki',
  cycleEnabled: false,
  cycleInCalendar: false,
};

export interface User {
  id: string;
  email: string;
  name: string;
  userType: UserType | null;
  gender: Gender | null;
  timezone: string;
  onboarded: boolean;
  lifeAreas: string[];
  prefs: Prefs;
  createdAt: string;
}

export type EventSource = 'manual' | 'webuntis' | 'ics' | 'google' | 'outlook' | 'assistant';

export type CalendarKind = 'cloqi' | 'custom' | 'study' | 'timetable' | 'webuntis' | 'google' | 'outlook' | 'ics';

export interface UserCalendar {
  id: string;
  userId: string;
  name: string;
  color: string;
  kind: CalendarKind;
  connectionId: string | null;
  externalId: string | null;
  visible: boolean;
  writable: boolean;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  calendarId: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  category: Category;
  source: EventSource;
  externalUid: string | null;
  connectionId: string | null;
  status: 'active' | 'cancelled';
  location: string | null;
  teacher: string | null;
  reminderMinutes: number | null;
  recurrenceFreq: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrenceInterval: number;
  recurrenceUntil: string | null;
  exdates: string[];
  seriesId: string | null;
  syncState: 'clean' | 'dirty' | 'conflict';
  remoteVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimetableEntry {
  id: string;
  userId: string;
  source: 'manual' | 'csv';
  subject: string;
  teacher: string | null;
  room: string | null;
  institution: string | null;
  weekday: number;   // 1 = Monday
  startTime: string;
  endTime: string;
  exdates: string[]; // single lessons that do not take place (YYYY-MM-DD)
}

export type TaskKind = 'test' | 'schularbeit' | 'pruefung' | 'hausuebung' | 'referat' | 'lernziel';
export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  test: 'Test', schularbeit: 'Schularbeit', pruefung: 'Prüfung', hausuebung: 'Hausübung', referat: 'Referat', lernziel: 'Lernziel',
};

export interface Task {
  id: string;
  userId: string;
  title: string;
  subject: string;
  kind: TaskKind;
  dueAt: string;
  estimatedMinutes: number;
  difficulty: 1 | 2 | 3;
  status: 'open' | 'done';
  priority: 1 | 2 | 3;
  notBefore: string | null;   // planning starts on this day (YYYY-MM-DD)
  createdAt: string;
}

export interface StudyBlock {
  id: string;
  userId: string;
  taskId: string;
  startAt: string;
  endAt: string;
  status: 'planned' | 'done' | 'missed';
  completedAt: string | null;
  note: string | null;
}

export type Provider = 'webuntis' | 'google' | 'outlook' | 'apple' | 'school';

export interface CalendarConnection {
  id: string;
  userId: string;
  provider: Provider;
  status: 'connected' | 'error' | 'expired' | 'disconnected';
  config: ConnectionConfig;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface ConnectionConfig {
  exportCategories?: Category[];
  exportCalendarId?: string;          // external calendar that receives CLOQI events
  importCalendarIds?: string[];       // external calendars imported into CLOQI
  availableCalendars?: { id: string; name: string; writable: boolean; primary?: boolean }[];
  account?: string;
  /** WebUntis via the normal (public) timetable link instead of an iCal link */
  untis?: UntisPublicConfig;
}

export interface UntisPublicConfig {
  host: string;
  school: string;
  elementType: 1 | 5;            // 1 = class timetable, 5 = personal student timetable
  elementId: number;
  label: string;                 // e.g. "1AK"
  groups: { name: string; subject: string; parallel: boolean }[];
  excludedGroups: string[];      // courses the student does not attend
  version?: number;              // import version (see UNTIS_IMPORT_VERSION)
}

export interface Suggestion {
  id: string;
  userId: string;
  kind: 'cancellation' | 'missed' | 'change' | 'conflict' | 'sync_conflict' | 'info';
  message: string;
  payload: Record<string, unknown>;
  status: 'open' | 'accepted' | 'dismissed';
  createdAt: string;
}

/** A unified, display-ready item for calendar views. */
export interface CalendarItem {
  key: string;
  kind: 'event' | 'lesson' | 'study' | 'deadline';
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  category: Category;
  status: 'active' | 'cancelled' | 'done' | 'missed' | 'planned';
  source: string;
  location: string | null;
  teacher: string | null;
  description: string | null;
  readOnly: boolean;
  taskId: string | null;
  reminderMinutes: number | null;
  calendarLabel: string;
  calendarId: string | null;
  calendarColor: string | null;
  recurring: boolean;
  occurrenceDate: string | null;
}

export interface CycleEntry {
  id: string;
  date: string;                       // YYYY-MM-DD
  type: 'period_start' | 'period_end' | 'log';
  mood: number | null;                // 1–5
  energy: number | null;              // 1–5
  symptoms: string[];
  note: string | null;
}
