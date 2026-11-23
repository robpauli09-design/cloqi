'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { parseCommand, type Intent } from '@/lib/assistant';
import { busyIntervals, dayRange, getCalendarItems } from '@/lib/calendar';
import { applyPlan, proposePlan } from '@/lib/planning';
import { createEvent, getBlock, getEvent, listBlocks, listTasks, updateBlock, updateEvent } from '@/lib/repo';
import { freeSlots } from '@/lib/scheduler';
import { addDays, formatDateDe, isValidDate, isValidTime, relativeDayDe, todayIn, utcToZoned, zonedToUtc } from '@/lib/time';
import { CATEGORIES, CATEGORY_META, TASK_KIND_LABELS, type Category, type TaskKind, type User } from '@/lib/types';
import { createTaskFor } from '@/lib/tasks';

export type Proposal =
  | { type: 'add_task'; subject: string; kind: TaskKind; date: string; time: string | null }
  | { type: 'add_event'; title: string; category: Category; date: string; start: string; end: string }
  | { type: 'move_block'; blockId: string; date: string; start: string }
  | { type: 'move_event'; eventId: string; occurrenceDate: string | null; date: string; start: string }
  | { type: 'plan_hours'; subject: string; minutes: number; from: string; to: string }
  | { type: 'replan' };

export interface AssistantReply { reply: string; proposal?: Proposal; confirmLabel?: string }

const fmtDay = (d: string, today: string) => `${relativeDayDe(d, today)}${relativeDayDe(d, today) === formatDateDe(d) ? '' : ` (${formatDateDe(d)})`}`;
const hm = (iso: string, tz: string) => utcToZoned(iso, tz).time;

async function describeDay(user: User, day: string, today: string): Promise<string> {
  const { from, to } = dayRange(day, user.timezone);
  const items = (await getCalendarItems(user, from, to)).filter(i => i.status !== 'missed');
  if (!items.length) return `${fmtDay(day, today)} ist noch nichts eingetragen. Genieß die freie Zeit!`;
  const lines = items.map(i => {
    const time = i.allDay ? 'ganztägig' : `${hm(i.startAt, user.timezone)}–${hm(i.endAt, user.timezone)}`;
    const suffix = i.status === 'cancelled' ? ' (entfällt)' : i.status === 'done' ? ' ✓' : '';
    return `• ${time} ${i.title}${suffix}`;
  });
  return `${fmtDay(day, today)} steht an:\n${lines.join('\n')}`;
}

export async function askCloqi(message: string): Promise<AssistantReply> {
  const user = await requireUser();
  const text = String(message ?? '').slice(0, 500);
  const today = todayIn(user.timezone);
  const intent: Intent = parseCommand(text, today, user.prefs.subjects.map(s => s.name));
  const tz = user.timezone;

  switch (intent.type) {
    case 'add_task': {
      const when = `${fmtDay(intent.date, today)}${intent.time ? ` um ${intent.time} Uhr` : ''}`;
      return {
        reply: `Verstanden: ${TASK_KIND_LABELS[intent.kind]} in ${intent.subject}, ${when}. Soll ich ihn eintragen und dir passende Lernzeiten einplanen?`,
        proposal: { type: 'add_task', subject: intent.subject, kind: intent.kind, date: intent.date, time: intent.time },
        confirmLabel: 'Eintragen & Lernplan erstellen',
      };
    }
    case 'add_event': {
      const s = zonedToUtc(intent.date, intent.start, tz).toISOString();
      const e = zonedToUtc(intent.date, intent.end, tz).toISOString();
      const clash = (await getCalendarItems(user, s, e)).filter(i => i.status === 'active' || i.status === 'planned');
      const warn = clash.length ? `\nAchtung: Das überschneidet sich mit „${clash[0].title}“.` : '';
      return {
        reply: `${intent.title} ${fmtDay(intent.date, today)}, ${intent.start}–${intent.end} Uhr (${CATEGORY_META[intent.category].label}). Soll ich das eintragen?${warn}`,
        proposal: { type: 'add_event', title: intent.title, category: intent.category, date: intent.date, start: intent.start, end: intent.end },
        confirmLabel: 'Eintragen',
      };
    }
    case 'day_overview':
      return { reply: await describeDay(user, intent.date, today) };
    case 'free_time': {
      const lines: string[] = [];
      for (let d = intent.from; d <= intent.to; d = addDays(d, 1)) {
        const { from, to } = dayRange(d, tz);
        const slots = freeSlots(d, tz, busyIntervals(await getCalendarItems(user, from, to)), user.prefs, new Date());
        if (slots.length) lines.push(`• ${fmtDay(d, today)}: ${slots.map(s => `${hm(new Date(s.start).toISOString(), tz)}–${hm(new Date(s.end).toISOString(), tz)}`).join(', ')}`);
      }
      return { reply: lines.length ? `Hier hast du Luft (innerhalb deiner Lernzeiten):\n${lines.join('\n')}` : 'In diesem Zeitraum ist es leider eng – ich finde keine freien Lernzeiten.' };
    }
    case 'upcoming_tests': {
      const open = (await listTasks(user.id, { openOnly: true })).filter(t => t.dueAt > new Date().toISOString()).slice(0, 6);
      if (!open.length) return { reply: 'Gerade stehen keine Tests an. Sag mir einfach Bescheid, wenn einer angekündigt wird!' };
      return { reply: `Das kommt auf dich zu:\n${open.map(t => `• ${fmtDay(utcToZoned(t.dueAt, tz).date, today)}: ${TASK_KIND_LABELS[t.kind]} ${t.subject}`).join('\n')}` };
    }
    case 'move_study': {
      const nowIso = new Date().toISOString();
      const tasks = new Map((await listTasks(user.id)).map(t => [t.id, t]));
      const block = (await listBlocks(user.id)).find(b => b.status === 'planned' && b.startAt > nowIso &&
        (!intent.subject || tasks.get(b.taskId)?.subject === intent.subject));
      if (!block) return { reply: 'Ich finde keinen geplanten Lernblock, den ich verschieben könnte.' };
      const { from, to } = dayRange(intent.date, tz);
      const duration = Date.parse(block.endAt) - Date.parse(block.startAt);
      const busy = busyIntervals(await getCalendarItems(user, from, to), { excludeStudyIds: new Set([block.id]) });
      const slot = freeSlots(intent.date, tz, busy, user.prefs, new Date()).find(s => s.end - s.start >= duration);
      if (!slot) return { reply: `${fmtDay(intent.date, today)} finde ich leider keinen passenden freien Zeitraum.` };
      const start = hm(new Date(slot.start).toISOString(), tz);
      return {
        reply: `Ich kann deinen ${tasks.get(block.taskId)?.subject ?? ''}-Lernblock auf ${fmtDay(intent.date, today)} um ${start} Uhr verschieben. Passt das?`,
        proposal: { type: 'move_block', blockId: block.id, date: intent.date, start }, confirmLabel: 'Verschieben',
      };
    }
    case 'plan_hours':
      return {
        reply: `Ich plane dir ${intent.minutes / 60} Stunde${intent.minutes === 60 ? '' : 'n'} ${intent.subject} zwischen ${formatDateDe(intent.from)} und ${formatDateDe(intent.to)} ein – verteilt auf freie Zeiten rund um deine Termine. Passt das?`,
        proposal: { type: 'plan_hours', subject: intent.subject, minutes: intent.minutes, from: intent.from, to: intent.to }, confirmLabel: 'Einplanen',
      };
    case 'list_range': {
      const lines: string[] = [];
      for (let d = intent.from; d <= intent.to; d = addDays(d, 1)) {
        const { from, to } = dayRange(d, tz);
        const items = (await getCalendarItems(user, from, to)).filter(i => i.status !== 'missed' && i.kind !== 'lesson');
        if (items.length) lines.push(`${fmtDay(d, today)}:\n${items.map(i => `  • ${i.allDay ? 'ganztägig' : hm(i.startAt, tz)} ${i.title}${i.status === 'cancelled' ? ' (entfällt)' : ''}`).join('\n')}`);
      }
      return { reply: lines.length ? `Deine Termine (ohne Unterricht):\n${lines.join('\n')}` : 'In diesem Zeitraum hast du keine Termine außer Unterricht.' };
    }
    case 'move_event': {
      const nowIso = new Date().toISOString();
      const horizon = new Date(Date.now() + 21 * 86400000).toISOString();
      const match = (await getCalendarItems(user, nowIso, horizon))
        .find(i => i.kind === 'event' && !i.readOnly && i.title.toLowerCase().includes(intent.keyword) && i.status === 'active');
      if (!match) return { reply: `Ich finde keinen kommenden Termin „${intent.keyword}“, den ich verschieben kann.` };
      const start = intent.time ?? hm(match.startAt, tz);
      const durationMin = Math.round((Date.parse(match.endAt) - Date.parse(match.startAt)) / 60000);
      const s = zonedToUtc(intent.date, start, tz).toISOString();
      const e = new Date(Date.parse(s) + durationMin * 60000).toISOString();
      const clash = (await getCalendarItems(user, s, e, { includeHidden: true })).filter(i => i.id !== match.id && (i.status === 'active' || i.status === 'planned') && !i.allDay);
      return {
        reply: `${match.title} (${fmtDay(utcToZoned(match.startAt, tz).date, today)}, ${hm(match.startAt, tz)}) auf ${fmtDay(intent.date, today)} um ${start} Uhr verschieben?${match.recurring ? ' Das betrifft nur diesen einen Termin der Serie.' : ''}${clash.length ? `\nAchtung: Dort ist schon „${clash[0].title}“.` : ''}`,
        proposal: { type: 'move_event', eventId: match.id, occurrenceDate: match.occurrenceDate, date: intent.date, start }, confirmLabel: 'Verschieben',
      };
    }
    case 'replan': {
      const p = await proposePlan(user, { kind: 'all' });
      return {
        reply: p.blocks.length ? `Ich würde ${p.blocks.length} Lernblöcke neu verteilen${p.shortfalls.length ? ` – für ${p.shortfalls.map(s => s.taskTitle).join(', ')} reicht die Zeit aber nicht ganz` : ''}. Soll ich?` : 'Es gibt gerade nichts neu zu planen.',
        proposal: p.blocks.length ? { type: 'replan' } : undefined, confirmLabel: 'Neu planen',
      };
    }
    default:
      return {
        reply: intent.reason === 'no_date'
          ? 'Wann ist das? Sag mir zum Beispiel „am Freitag“ oder „am 3.12.“.'
          : 'Das kann ich noch nicht. Probier zum Beispiel:\n• „Ich habe am Freitag einen Englisch-Test.“\n• „Trag morgen Training um 18 Uhr ein.“\n• „Was habe ich morgen vor?“\n• „Wann habe ich Zeit zum Lernen?“',
      };
  }
}

/** Executes a confirmed proposal. Everything is validated again on the server. */
export async function confirmProposal(p: Proposal): Promise<{ ok: boolean; reply: string }> {
  const user = await requireUser();
  try {
    if (p.type === 'add_task') {
      if (!isValidDate(p.date) || (p.time && !isValidTime(p.time)) || !(p.kind in TASK_KIND_LABELS)) throw new Error('Ungültige Angaben.');
      const taskId = await createTaskFor(user, { subject: String(p.subject).slice(0, 60), kind: p.kind, day: p.date, time: p.time ?? '08:00', difficulty: 2 });
      const plan = await proposePlan(user, { kind: 'task', taskId });
      await applyPlan(user, plan);
      revalidatePath('/', 'layout');
      const missing = plan.shortfalls[0]?.missingMinutes;
      return { ok: true, reply: `Erledigt! Ich habe ${plan.blocks.length} Lernblöcke eingeplant.${missing ? ` Für ${missing} Minuten fand ich keinen Platz – schau in „Learn“, ob du mehr Zeit freigeben kannst.` : ''}` };
    }
    if (p.type === 'add_event') {
      if (!isValidDate(p.date) || !isValidTime(p.start) || !isValidTime(p.end) || p.end <= p.start || !CATEGORIES.includes(p.category)) throw new Error('Ungültige Angaben.');
      await createEvent(user.id, {
        title: String(p.title).slice(0, 120), category: p.category, source: 'assistant',
        startAt: zonedToUtc(p.date, p.start, user.timezone).toISOString(), endAt: zonedToUtc(p.date, p.end, user.timezone).toISOString(),
        reminderMinutes: user.prefs.reminderDefault,
      });
      revalidatePath('/', 'layout');
      return { ok: true, reply: 'Eingetragen! Ich erinnere dich rechtzeitig.' };
    }
    if (p.type === 'move_block') {
      const b = await getBlock(user.id, p.blockId);
      if (!b || !isValidDate(p.date) || !isValidTime(p.start)) throw new Error('Lernblock nicht gefunden.');
      const s = zonedToUtc(p.date, p.start, user.timezone);
      await updateBlock(user.id, b.id, { startAt: s.toISOString(), endAt: new Date(s.getTime() + Date.parse(b.endAt) - Date.parse(b.startAt)).toISOString(), status: 'planned' });
      revalidatePath('/', 'layout');
      return { ok: true, reply: 'Verschoben!' };
    }
    if (p.type === 'plan_hours') {
      if (!isValidDate(p.from) || !isValidDate(p.to) || p.to < p.from || !(p.minutes > 0 && p.minutes <= 1200)) throw new Error('Ungültige Angaben.');
      const taskId = await createTaskFor(user, {
        subject: String(p.subject).slice(0, 60), kind: 'lernziel', day: addDays(p.to, 1), time: '00:00', difficulty: 2,
        minutes: Math.round(p.minutes / 15) * 15, title: `Lernziel ${p.subject}`, notBefore: p.from,
      });
      const plan = await proposePlan(user, { kind: 'task', taskId });
      await applyPlan(user, plan);
      revalidatePath('/', 'layout');
      const missing = plan.shortfalls[0]?.missingMinutes;
      return { ok: true, reply: `Eingeplant: ${plan.blocks.length} Lernblöcke für ${p.subject}.${missing ? ` ${missing} Minuten passten nicht mehr hinein.` : ''}` };
    }
    if (p.type === 'move_event') {
      const ev = await getEvent(user.id, p.eventId);
      if (!ev || !isValidDate(p.date) || !isValidTime(p.start) || ['webuntis', 'ics'].includes(ev.source)) throw new Error('Termin nicht gefunden.');
      const s = zonedToUtc(p.date, p.start, user.timezone);
      const duration = Date.parse(ev.endAt) - Date.parse(ev.startAt);
      const startAt = s.toISOString();
      const endAt = new Date(s.getTime() + duration).toISOString();
      if (ev.recurrenceFreq && p.occurrenceDate) {
        await updateEvent(user.id, ev.id, { exdates: [...new Set([...ev.exdates, p.occurrenceDate])] });
        await createEvent(user.id, { title: ev.title, description: ev.description, startAt, endAt, category: ev.category, location: ev.location,
          reminderMinutes: ev.reminderMinutes, calendarId: ev.calendarId, seriesId: ev.id, source: ev.source });
      } else {
        await updateEvent(user.id, ev.id, { startAt, endAt, ...(['google', 'outlook'].includes(ev.source) ? { syncState: 'dirty' as const } : {}) });
      }
      revalidatePath('/', 'layout');
      return { ok: true, reply: 'Verschoben! Falls sich jetzt etwas überschneidet, siehst du es im Kalender markiert.' };
    }
    if (p.type === 'replan') {
      await applyPlan(user, await proposePlan(user, { kind: 'all' }));
      revalidatePath('/', 'layout');
      return { ok: true, reply: 'Dein Lernplan ist aktualisiert.' };
    }
    return { ok: false, reply: 'Unbekannte Aktion.' };
  } catch (e) {
    return { ok: false, reply: e instanceof Error ? e.message : 'Das hat nicht geklappt.' };
  }
}
