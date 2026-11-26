'use server';
import { forgetSchool, syncSchool } from '@/lib/school';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { destroySession, requireUser } from '@/lib/auth';
import { busyIntervals, dayRange, getCalendarItems } from '@/lib/calendar';
import { encrypt } from '@/lib/crypto';
import { parseTimetableCsv } from '@/lib/csv';
import { createOrRotateFeed } from '@/lib/feed';
import { parseIcs } from '@/lib/ics';
import { isConfigured, listRemoteCalendars, PROVIDER_LABEL, resolveConflict, revokeAccess, syncProvider, type OAuthProvider } from '@/lib/integrations';
import { applyPlan, detectMissedBlocks, proposePlan } from '@/lib/planning';
import {
  addBreak, addCycleEntry, addTimetableEntry, deleteBreak, deleteConnection, deleteCycleEntry, deleteTimetableEntry, deleteUser,
  getConnection, getEvent, getSuggestion, getTimetableEntry, insertBlocks, listConnections, listTasks, setCycleConsent,
  setSuggestionStatus, setTimetableExdates, updateUser, upsertConnection,
} from '@/lib/repo';
import { freeSlots } from '@/lib/scheduler';
import { addDays, isValidDate, isValidTime, todayIn, utcToZoned } from '@/lib/time';
import { CATEGORIES, GENDER_LABELS, mascotFor, parseAiMode, type AiMode, USER_TYPE_LABELS, type Category, type Gender, type Prefs, type Subject, type User, type UserType, OPTIONAL_TABS } from '@/lib/types';
import { fail, InputError, int, text, time, type ActionResult } from '@/lib/validate';
import { autoSyncFor } from '@/lib/auto-sync';
import { normalizeWebUntisUrl, syncWebUntis, upsertFeedEvents, fetchCalendar, isWebUntisHost } from '@/lib/webuntis';
import { ForbiddenError, listPublicClasses, parsePublicLink, studentIsPublic, UNTIS_IMPORT_VERSION, type UntisClass } from '@/lib/untis-public';

async function done(message: string): Promise<ActionResult> {
  revalidatePath('/', 'layout');
  return { ok: true, message };
}

// ---------- onboarding ----------

export async function completeOnboarding(form: FormData) {
  const user = await requireUser();
  const name = text(form, 'name', { max: 40 }) || user.email.split('@')[0];
  const type = String(form.get('userType') ?? '') as UserType;
  const areas = form.getAll('areas').map(String).filter(a => ['schule', 'arbeit', 'training', 'privat'].includes(a));
  const mascot = form.get('mascot') === 'clea' ? 'clea' : 'cloki';
  const gender = String(form.get('gender') ?? '');
  await updateUser(user.id, {
    name, userType: type in USER_TYPE_LABELS ? type : 'sonstiges', lifeAreas: areas, onboarded: true,
    gender: gender in GENDER_LABELS ? gender as Gender : null,
    prefs: {
      ...user.prefs, mascot: mascotFor(gender in GENDER_LABELS ? gender as Gender : null, mascot),
      navTabs: form.get('tabsSent') ? OPTIONAL_TABS.filter(t => form.getAll('tabs').map(String).includes(t)) : user.prefs.navTabs,
    },
  });
  // always start on Home; a chosen connection is offered there as the next step
  const setup = String(form.get('setup') ?? '');
  redirect(`/dashboard?welcome=1${['webuntis', 'import', 'manual', 'kalender'].includes(setup) ? `&setup=${setup}` : ''}`);
}

// ---------- profile & preferences ----------

export async function saveProfile(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const type = String(form.get('userType') ?? '') as UserType;
    const tz = String(form.get('timezone') ?? user.timezone);
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new InputError('Unbekannte Zeitzone.'); }
    const g = String(form.get('gender') ?? '');
    const gender = g in GENDER_LABELS ? g as Gender : user.gender;
    await updateUser(user.id, {
      name: text(form, 'name', { required: true, max: 40, label: 'Name' }),
      userType: type in USER_TYPE_LABELS ? type : user.userType,
      gender,
      timezone: tz,
      prefs: { ...user.prefs, mascot: mascotFor(gender, form.get('mascot') === 'clea' ? 'clea' : 'cloki') },
    });
    return done('Profil gespeichert.');
  } catch (e) { return fail(e); }
}

export async function savePrefs(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const prefs: Prefs = {
      ...user.prefs,
      studyStart: time(form, 'studyStart', 'Lernbeginn'), studyEnd: time(form, 'studyEnd', 'Lernende'),
      weekendStart: time(form, 'weekendStart', 'Wochenende ab'), weekendEnd: time(form, 'weekendEnd', 'Wochenende bis'),
      studyOnSunday: form.get('studyOnSunday') === 'on',
      maxStudyPerDay: int(form, 'maxStudyPerDay', 30, 480), blockMax: int(form, 'blockMax', 15, 180),
      breakMin: int(form, 'breakMin', 0, 60), dailyGoalMin: int(form, 'dailyGoalMin', 0, 480),
      reminderDefault: int(form, 'reminderDefault', 0, 1440),
      aiMode: form.has('aiMode') ? parseAiMode(form.get('aiMode')) : user.prefs.aiMode,
    };
    const pause = String(form.get('studyPauseUntil') ?? '').trim();
    const today = todayIn(user.timezone);
    if (pause && (!isValidDate(pause) || pause > addDays(today, 60))) throw new InputError('Die Lernpause darf höchstens 60 Tage dauern.');
    prefs.studyPauseUntil = pause && pause >= today ? pause : null;
    if (prefs.studyEnd <= prefs.studyStart || prefs.weekendEnd <= prefs.weekendStart) throw new InputError('Das Ende der Lernzeit muss nach dem Beginn liegen.');
    await updateUser(user.id, { prefs });
    // a new/changed study break or study window moves the study blocks right away
    if (prefs.studyPauseUntil !== user.prefs.studyPauseUntil) await applyPlan({ ...user, prefs }, await proposePlan({ ...user, prefs }, { kind: 'all' }));
    return done('Lernpräferenzen gespeichert.');
  } catch (e) { return fail(e); }
}

export async function addSubject(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const name = text(form, 'subject', { required: true, max: 40, label: 'Fach' });
    const difficulty = int(form, 'difficulty', 1, 3, 2) as Subject['difficulty'];
    const subjects = user.prefs.subjects.filter(s => s.name.toLowerCase() !== name.toLowerCase());
    await updateUser(user.id, { prefs: { ...user.prefs, subjects: [...subjects, { name, difficulty }].slice(0, 40) } });
    return done(`${name} gespeichert.`);
  } catch (e) { return fail(e); }
}

export async function removeSubject(name: string): Promise<ActionResult> {
  const user = await requireUser();
  await updateUser(user.id, { prefs: { ...user.prefs, subjects: user.prefs.subjects.filter(s => s.name !== name) } });
  return done('Fach entfernt.');
}

export async function deleteAccount(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'LÖSCHEN') return { ok: false, error: 'Bitte tippe LÖSCHEN zur Bestätigung.' };
  for (const p of ['google', 'outlook'] as OAuthProvider[]) await revokeAccess(user, p).catch(() => undefined);
  await deleteUser(user.id);
  await destroySession();
  redirect('/login?deleted=1');
}

// ---------- connections ----------

export type WebUntisLookup =
  | { ok: true; kind: 'ical' }
  | { ok: true; kind: 'public'; school: string; studentPublic: boolean; classes: UntisClass[] }
  | { ok: false; error: string };

/** Step 1: checks a pasted WebUntis link. For the normal timetable link it lists the public classes. */
export async function lookupWebUntis(raw: string): Promise<WebUntisLookup> {
  try {
    const user = await requireUser();
    const link = String(raw ?? '').trim().slice(0, 2000);
    if (!link) throw new InputError('Bitte füge deinen WebUntis-Link ein.');
    const target = parsePublicLink(link);
    if (!target) { normalizeWebUntisUrl(link); return { ok: true, kind: 'ical' }; }
    const studentPublic = await studentIsPublic(target, todayIn(user.timezone));
    let classes: UntisClass[] = [];
    try { classes = await listPublicClasses(target); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
    if (!studentPublic && !classes.length) {
      throw new InputError('Deine Schule hat keinen öffentlichen Stundenplan freigegeben. Nutze stattdessen den iCal-Link aus WebUntis (Profil → Datenzugriff) oder lege den Stundenplan manuell an.');
    }
    return { ok: true, kind: 'public', school: target.school, studentPublic, classes };
  } catch (e) { return fail(e) as { ok: false; error: string }; }
}

/** Step 2: connects WebUntis – via iCal link, the public student timetable or a public class timetable. */
export async function connectWebUntis(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const raw = text(form, 'url', { required: true, max: 2000, label: 'WebUntis-Link' });
    const target = parsePublicLink(raw);
    if (target) {
      const choice = String(form.get('target') ?? '');
      let elementType: 1 | 5, elementId: number, label: string;
      if (choice === 'student' && target.entityId && await studentIsPublic(target, todayIn(user.timezone))) {
        elementType = 5; elementId = target.entityId; label = 'Mein Stundenplan';
      } else {
        const cls = (await listPublicClasses(target)).find(c => String(c.id) === choice);
        if (!cls) throw new InputError('Bitte wähle deine Klasse aus.');
        elementType = 1; elementId = cls.id; label = cls.name;
      }
      await deleteConnection(user.id, 'webuntis'); // switching class/source: start clean
      await upsertConnection(user.id, 'webuntis', {
        status: 'connected', secretEnc: encrypt(`https://${target.host}/WebUntis/?school=${encodeURIComponent(target.school)}`),
        config: { untis: { host: target.host, school: target.school, elementType, elementId, label, groups: [], excludedGroups: [] } },
      });
    } else {
      const url = normalizeWebUntisUrl(raw);
      parseIcs(await fetchCalendar(url, isWebUntisHost), user.timezone); // test the link before storing it
      await deleteConnection(user.id, 'webuntis');
      await upsertConnection(user.id, 'webuntis', { status: 'connected', secretEnc: encrypt(url.toString()) });
    }
    const stats = await syncWebUntis(user);
    const conn = await getConnection(user.id, 'webuntis');
    const parallel = conn?.config.untis?.groups.filter(g => g.parallel).length ?? 0;
    revalidatePath('/connect');
    return done(`WebUntis verbunden: ${stats.imported} Stunden übernommen${stats.cancelled ? `, ${stats.cancelled} davon entfallen` : ''}.${parallel ? ' Wähle jetzt noch, welche Kurse du besuchst.' : ''}`);
  } catch (e) { return fail(e); }
}

/** Which parallel courses (religion/ethics, languages, …) of the class timetable the student attends. */
export async function saveWebUntisGroups(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const conn = await getConnection(user.id, 'webuntis');
    const cfg = conn?.config.untis;
    if (!conn || !cfg) throw new InputError('WebUntis ist nicht über den Stundenplan-Link verbunden.');
    const attend = new Set(form.getAll('attend').map(String));
    const excludedGroups = cfg.groups.filter(g => !attend.has(g.name)).map(g => g.name);
    await upsertConnection(user.id, 'webuntis', { config: { ...conn.config, untis: { ...cfg, excludedGroups } } });
    await syncWebUntis(user);
    revalidatePath('/calendar');
    revalidatePath('/connect');
    return done('Gespeichert – dein Stundenplan zeigt jetzt nur noch deine Kurse.');
  } catch (e) { return fail(e); }
}

export async function syncNow(provider: 'webuntis' | OAuthProvider): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (provider === 'school') {
      if (!isConfigured('school')) throw new InputError('Microsoft Schule ist auf diesem Server nicht eingerichtet.');
      const s = await syncSchool(user);
      return done(`Microsoft Schule: ${s.homework} Hausübungen (${s.newTasks} neu eingeplant), ${s.pages} OneNote-Seiten.`);
    }
    if (provider === 'webuntis') {
      const s = await syncWebUntis(user);
      return done(`Aktualisiert: ${s.imported} neu, ${s.updated} geändert, ${s.cancelled + s.removed} entfallen.`);
    }
    if (!isConfigured(provider)) throw new InputError(`${PROVIDER_LABEL[provider]} ist auf diesem Server nicht eingerichtet.`);
    const s = await syncProvider(user, provider);
    return done(`${PROVIDER_LABEL[provider]}: ${s.pulled} übernommen, ${s.pushed} übertragen, ${s.deleted} entfernt${s.conflicts ? `, ${s.conflicts} Konflikte` : ''}.`);
  } catch (e) { return fail(e); }
}

export async function disconnect(provider: 'webuntis' | 'apple' | OAuthProvider): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (provider === 'google' || provider === 'outlook') await revokeAccess(user, provider);
    if (provider === 'school') await forgetSchool(user.id);
    await deleteConnection(user.id, provider);
    return done('Verbindung getrennt. Importierte Termine wurden aus CLOQI entfernt.');
  } catch (e) { return fail(e); }
}

export async function saveProviderSettings(provider: OAuthProvider, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const conn = await getConnection(user.id, provider);
    if (!conn) throw new InputError('Nicht verbunden.');
    const available = conn.config.availableCalendars ?? [];
    const imports = form.getAll('import').map(String).filter(id => available.some(c => c.id === id));
    const exportId = String(form.get('exportCalendarId') ?? '');
    const exportCats = form.getAll('exportCategories').map(String).filter((c): c is Category => CATEGORIES.includes(c as Category));
    await upsertConnection(user.id, provider, {
      config: {
        importCalendarIds: imports,
        exportCalendarId: available.some(c => c.id === exportId && c.writable) ? exportId : undefined,
        exportCategories: exportCats,
      },
    });
    return done('Gespeichert. Die Änderungen gelten ab der nächsten Synchronisierung.');
  } catch (e) { return fail(e); }
}

export async function refreshProviderCalendars(provider: OAuthProvider): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await upsertConnection(user.id, provider, { config: { availableCalendars: await listRemoteCalendars(user, provider) } });
    return done('Kalenderliste aktualisiert.');
  } catch (e) { return fail(e); }
}

export async function enableAppleFeed(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await createOrRotateFeed(user);
    return done('Dein persönlicher Kalender-Link ist bereit. Ein alter Link funktioniert ab jetzt nicht mehr.');
  } catch (e) { return fail(e); }
}

export async function saveFeedCategories(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const cats = form.getAll('exportCategories').map(String).filter((c): c is Category => CATEGORIES.includes(c as Category));
    await upsertConnection(user.id, 'apple', { config: { exportCategories: cats } });
    return done('Gespeichert.');
  } catch (e) { return fail(e); }
}

// ---------- timetable ----------

export async function addLesson(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const startTime = time(form, 'start', 'Beginn');
    const endTime = time(form, 'end', 'Ende');
    if (endTime <= startTime) throw new InputError('Das Ende muss nach dem Beginn liegen.');
    await addTimetableEntry(user.id, {
      source: 'manual', subject: text(form, 'subject', { required: true, max: 60, label: 'Fach' }),
      weekday: int(form, 'weekday', 1, 7), startTime, endTime,
      room: text(form, 'room', { max: 40 }) || null, teacher: text(form, 'teacher', { max: 60 }) || null,
      institution: text(form, 'institution', { max: 80 }) || null,
    });
    return done('Unterrichtseinheit gespeichert – sie erscheint jede Woche.');
  } catch (e) { return fail(e); }
}

export async function removeLesson(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await deleteTimetableEntry(user.id, id);
  return done('Unterrichtseinheit gelöscht.');
}

/** Marks one lesson of the manual timetable as not taking place on a given date. */
export async function cancelLessonOnce(id: string, date: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const entry = await getTimetableEntry(user.id, id);
    if (!entry || !isValidDate(date)) throw new InputError('Unterrichtseinheit nicht gefunden.');
    await setTimetableExdates(user.id, id, [...new Set([...entry.exdates, date])]);
    return done(`${entry.subject} entfällt an diesem Tag.`);
  } catch (e) { return fail(e); }
}

export async function importTimetableFile(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) throw new InputError('Bitte wähle eine Datei.');
    if (file.size > 3 * 1024 * 1024) throw new InputError('Die Datei ist zu groß (max. 3 MB).');
    const content = await file.text();
    if (/\.ics$/i.test(file.name) || content.includes('BEGIN:VCALENDAR')) {
      const events = parseIcs(content, user.timezone, new Date(Date.now() + 365 * 86400000));
      const category = (CATEGORIES.includes(String(form.get('category')) as Category) ? String(form.get('category')) : 'schule') as Category;
      const s = await upsertFeedEvents(user, 'ics', null, events, category);
      return done(`${s.imported} Termine importiert${s.updated ? `, ${s.updated} aktualisiert` : ''}.`);
    }
    const { lessons, errors } = parseTimetableCsv(content);
    if (!lessons.length) throw new InputError(errors[0] ?? 'Keine Unterrichtseinheiten gefunden.');
    for (const l of lessons) await addTimetableEntry(user.id, { ...l, source: 'csv', institution: null });
    return done(`${lessons.length} Unterrichtseinheiten importiert${errors.length ? ` (${errors.length} Zeilen übersprungen)` : ''}.`);
  } catch (e) { return fail(e); }
}

export async function addHoliday(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const from = String(form.get('from') ?? ''), to = String(form.get('to') ?? '');
    if (!isValidDate(from) || !isValidDate(to) || to < from) throw new InputError('Bitte gib einen gültigen Zeitraum an.');
    await addBreak(user.id, text(form, 'name', { max: 40 }) || 'Ferien', from, to);
    return done('Gespeichert – in diesem Zeitraum wird kein Unterricht angezeigt.');
  } catch (e) { return fail(e); }
}

export async function removeHoliday(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await deleteBreak(user.id, id);
  return done('Entfernt.');
}

// ---------- suggestions ----------

export async function respondToSuggestion(id: string, accept: boolean, choice?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const s = await getSuggestion(user.id, id);
    if (!s || s.status !== 'open') throw new InputError('Dieser Vorschlag ist nicht mehr aktuell.');
    await setSuggestionStatus(user.id, id, accept ? 'accepted' : 'dismissed');
    if (!accept) return done('Alles klar, ich lasse es so.');
    const action = s.payload.action;
    if (action === 'replan') {
      await applyPlan(user, await proposePlan(user, { kind: 'all' }));
      return done('Erledigt – dein Lernplan ist neu verteilt.');
    }
    if (action === 'use_free_slot') return await useFreeSlot(user, String(s.payload.startAt), String(s.payload.endAt));
    if (action === 'resolve_conflict') {
      const ev = await getEvent(user.id, String(s.payload.eventId));
      if (!ev) throw new InputError('Termin nicht gefunden.');
      await resolveConflict(user, ev, choice === 'remote' ? 'remote' : 'cloqi', s.payload.remote as never);
      return done(choice === 'remote' ? 'Die Version aus dem externen Kalender gilt.' : 'Die CLOQI-Version wurde übertragen.');
    }
    return done('Danke!');
  } catch (e) { return fail(e); }
}

async function useFreeSlot(user: User, startAt: string, endAt: string): Promise<ActionResult> {
  const nowIso = new Date().toISOString();
  const task = (await listTasks(user.id, { openOnly: true })).find(t => t.dueAt > endAt);
  if (!task) return done('Gerade steht kein Test an – genieß die freie Zeit!');
  const day = utcToZoned(startAt, user.timezone).date;
  const { from, to } = dayRange(day, user.timezone);
  const busy = busyIntervals(await getCalendarItems(user, from, to, { includeHidden: true }));
  const slot = freeSlots(day, user.timezone, busy, { ...user.prefs, studyStart: '00:00', studyEnd: '23:59', weekendStart: '00:00', weekendEnd: '23:59' }, new Date())
    .find(s => s.start < Date.parse(endAt) && s.end > Date.parse(startAt) && s.end > Date.parse(nowIso));
  if (!slot) return done('Die freie Stunde ist schon vorbei oder belegt.');
  const s = Math.max(slot.start, Date.parse(startAt));
  const e = Math.min(slot.end, Date.parse(endAt), s + user.prefs.blockMax * 60000);
  await insertBlocks(user.id, [{ taskId: task.id, startAt: new Date(s).toISOString(), endAt: new Date(e).toISOString(), note: 'Freistunde' }]);
  return done(`Ich habe die freie Zeit für ${task.subject} eingeplant.`);
}

// ---------- background sync ----------

/** Called by the website shell: refreshes stale connections and detects missed study blocks. */
export async function autoSync(): Promise<{ changed: boolean }> {
  const user = await requireUser();
  const r = await autoSyncFor(user);
  if (r.changed) revalidatePath('/', 'layout');
  return r;
}

// ---------- cycle module (sensitive data) ----------

export async function setCycleModule(enabled: boolean, consent: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (enabled && !consent) throw new InputError('Bitte bestätige die Einwilligung zur Verarbeitung deiner Zyklusdaten.');
    if (enabled && user.gender === 'm') throw new InputError('Cycle ist für dein Profil nicht verfügbar.');
    await setCycleConsent(user.id, enabled);
    await updateUser(user.id, { prefs: { ...user.prefs, cycleEnabled: enabled, cycleInCalendar: enabled && user.prefs.cycleInCalendar } });
    return done(enabled ? 'CYCLE ist aktiviert.' : 'CYCLE ist deaktiviert und alle Zyklusdaten wurden gelöscht.');
  } catch (e) { return fail(e); }
}

export async function setCycleInCalendar(show: boolean): Promise<ActionResult> {
  const user = await requireUser();
  await updateUser(user.id, { prefs: { ...user.prefs, cycleInCalendar: show } });
  return done(show ? 'Zyklus wird im CLOQI-Kalender angezeigt (nur in CLOQI).' : 'Ausgeblendet.');
}

export async function logCycle(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!user.prefs.cycleEnabled) throw new InputError('CYCLE ist nicht aktiviert.');
    const date = String(form.get('date') ?? todayIn(user.timezone));
    if (!isValidDate(date)) throw new InputError('Ungültiges Datum.');
    const type = String(form.get('type'));
    if (!['period_start', 'period_end', 'log'].includes(type)) throw new InputError('Ungültiger Eintrag.');
    const opt = (k: string) => { const v = String(form.get(k) ?? ''); return v ? Math.min(5, Math.max(1, Number(v))) : null; };
    const allowed = ['Krämpfe', 'Kopfschmerzen', 'Müdigkeit', 'Rückenschmerzen', 'Hautunreinheiten', 'Heißhunger', 'Übelkeit', 'Brustspannen'];
    await addCycleEntry(user.id, {
      date, type: type as 'period_start', mood: opt('mood'), energy: opt('energy'),
      symptoms: form.getAll('symptoms').map(String).filter(s => allowed.includes(s)),
      note: text(form, 'note', { max: 300 }) || null,
    });
    return done('Eingetragen.');
  } catch (e) { return fail(e); }
}

export async function removeCycleEntry(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await deleteCycleEntry(user.id, id);
  return done('Gelöscht.');
}

/** Which areas (tabs) the user wants – Home, CLOQI AI and Kalender are always there. */
export async function saveTabs(tabs: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const chosen = OPTIONAL_TABS.filter(t => tabs.includes(t));
    await updateUser(user.id, { prefs: { ...user.prefs, navTabs: chosen } });
    return done('Bereiche gespeichert.');
  } catch (e) { return fail(e); }
}

/** Mode switch in the chat (Nachfragen · Automatisch eintragen · Auto). */
export async function saveAiMode(mode: AiMode): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await updateUser(user.id, { prefs: { ...user.prefs, aiMode: parseAiMode(mode) } });
    return done('Modus gespeichert.');
  } catch (e) { return fail(e); }
}
