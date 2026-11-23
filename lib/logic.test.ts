import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedToUtc, utcToZoned, addDays, startOfWeek, weekdayOf } from './time.ts';
import { planStudy, estimateMinutes, type Interval } from './scheduler.ts';
import { parseCommand, parseDate, parseTimes } from './assistant.ts';
import { parseIcs, buildIcs } from './ics.ts';
import { findConflicts } from './conflicts.ts';
import { DEFAULT_PREFS, type CalendarItem } from './types.ts';
import { expandOccurrences, describeRule } from './recurrence.ts';
import { parseTimetableCsv } from './csv.ts';
import { summarize } from './cycle.ts';

test('cycle: averages cycle and period length and estimates the next start', () => {
  const s = summarize([
    { date: '2026-08-01', type: 'period_start' }, { date: '2026-08-05', type: 'period_end' },
    { date: '2026-08-31', type: 'period_start' }, { date: '2026-09-04', type: 'period_end' },
    { date: '2026-09-30', type: 'period_start' }, { date: '2026-10-03', type: 'period_end' },
    { date: '2026-10-30', type: 'period_start' },
  ], '2026-11-05');
  assert.equal(s.cycleLength, 30);
  assert.equal(s.periodLength, 5); // (5+5+4)/3 rounded
  assert.equal(s.nextStart, '2026-11-29');
  assert.equal(s.dayOfCycle, 7);
  assert.equal(s.phase, 'follikel');
  assert.equal(summarize([], '2026-11-05').phase, null);
});

test('recurrence: weekly, biweekly, monthly (skips 31st), yearly, exdates, until, DST', () => {
  const s = zonedToUtc('2026-10-20', '17:00', 'Europe/Vienna').toISOString();
  const e = zonedToUtc('2026-10-20', '18:30', 'Europe/Vienna').toISOString();
  const weekly = expandOccurrences(s, e, { freq: 'weekly', interval: 1, until: '2026-11-10', exdates: ['2026-11-03'] }, '2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z', 'Europe/Vienna');
  assert.deepEqual(weekly.map(o => o.date), ['2026-10-20', '2026-10-27', '2026-11-10']);
  assert.equal(utcToZoned(weekly[1].startAt, 'Europe/Vienna').time, '17:00', 'after DST switch');
  const bi = expandOccurrences(s, e, { freq: 'weekly', interval: 2, until: null, exdates: [] }, '2026-11-20T00:00:00Z', '2026-12-20T00:00:00Z', 'Europe/Vienna');
  assert.deepEqual(bi.map(o => o.date), ['2026-12-01', '2026-12-15']);
  const ms = zonedToUtc('2026-01-31', '10:00', 'Europe/Vienna').toISOString();
  const me = zonedToUtc('2026-01-31', '11:00', 'Europe/Vienna').toISOString();
  const monthly = expandOccurrences(ms, me, { freq: 'monthly', interval: 1, until: null, exdates: [] }, '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z', 'Europe/Vienna');
  assert.deepEqual(monthly.map(o => o.date), ['2026-01-31', '2026-03-31', '2026-05-31']);
  const yearly = expandOccurrences(ms, me, { freq: 'yearly', interval: 1, until: null, exdates: [] }, '2027-01-01T00:00:00Z', '2029-01-01T00:00:00Z', 'Europe/Vienna');
  assert.deepEqual(yearly.map(o => o.date), ['2027-01-31', '2028-01-31']);
  assert.equal(describeRule({ freq: 'weekly', interval: 2 }), 'Alle zwei Wochen');
  assert.equal(describeRule({ freq: 'daily', interval: 3 }), 'Alle 3 Tage');
});

test('csv: reads timetable rows and reports bad lines', () => {
  const r = parseTimetableCsv('Fach;Wochentag;Beginn;Ende;Raum;Lehrer\nMathematik;Montag;08:00;09:40;R4DK;HOF\nEnglisch;Di;10.00;10:50;;\nKaputt;Xtag;1;2');
  assert.equal(r.lessons.length, 2);
  assert.deepEqual(r.lessons[1], { subject: 'Englisch', weekday: 2, startTime: '10:00', endTime: '10:50', room: null, teacher: null });
  assert.equal(r.errors.length, 1);
});

const TZ = 'Europe/Vienna';
const MON = '2026-11-23'; // a Monday

test('time: Vienna wall clock round-trips in winter and summer', () => {
  assert.equal(zonedToUtc('2026-11-23', '08:00', TZ).toISOString(), '2026-11-23T07:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01', '08:00', TZ).toISOString(), '2026-07-01T06:00:00.000Z');
  assert.deepEqual(utcToZoned('2026-11-22T23:30:00Z', TZ).date, '2026-11-23');
  assert.equal(weekdayOf(MON), 1);
  assert.equal(startOfWeek('2026-11-29'), MON);
  assert.equal(addDays('2026-10-24', 7), '2026-10-31');
});

const at = (d: string, t: string) => zonedToUtc(d, t, TZ);
const iv = (d: string, from: string, to: string): Interval => ({ start: at(d, from).getTime(), end: at(d, to).getTime() });

test('scheduler: spreads a Thursday test over the days before and never overlaps busy time', () => {
  const busy = [iv(MON, '17:00', '18:30'), iv('2026-11-24', '15:00', '19:00')];
  const res = planStudy({
    now: at(MON, '07:00'), tz: TZ, busy, prefs: DEFAULT_PREFS,
    tasks: [{ id: 'math', title: 'Mathe', dueAt: at('2026-11-26', '10:00').toISOString(), remainingMinutes: 120, difficulty: 2, priority: 2 }],
  });
  assert.equal(res.shortfalls.length, 0);
  const days = res.blocks.map(b => utcToZoned(b.startAt, TZ).date);
  assert.ok(days.every(d => d < '2026-11-26'), 'no study on the test day');
  assert.ok(new Set(days).size >= 2, 'spread over several days');
  assert.equal(res.blocks.reduce((s, b) => s + b.minutes, 0), 120);
  for (const b of res.blocks) {
    const s = Date.parse(b.startAt), e = Date.parse(b.endAt);
    for (const x of busy) assert.ok(e + 15 * 60000 <= x.start || s - 15 * 60000 >= x.end, 'keeps a break to busy slots');
    const local = utcToZoned(b.startAt, TZ);
    assert.ok(local.time >= DEFAULT_PREFS.studyStart, 'inside the study window');
  }
  assert.equal(res.blocks[0].label, 'Grundlagen');
  assert.equal(res.blocks[res.blocks.length - 1].label, 'Wiederholung');
});

test('scheduler: several tests in one week – earlier test is prioritised, no double booking', () => {
  const res = planStudy({
    now: at(MON, '07:00'), tz: TZ, busy: [], prefs: { ...DEFAULT_PREFS, maxStudyPerDay: 90 },
    tasks: [
      { id: 'en', title: 'Englisch', dueAt: at('2026-11-25', '08:00').toISOString(), remainingMinutes: 90, difficulty: 2, priority: 2 },
      { id: 'ma', title: 'Mathe', dueAt: at('2026-11-26', '08:00').toISOString(), remainingMinutes: 120, difficulty: 3, priority: 2 },
      { id: 'bwl', title: 'BWL', dueAt: at('2026-11-27', '08:00').toISOString(), remainingMinutes: 60, difficulty: 1, priority: 2 },
    ],
  });
  const sorted = [...res.blocks].sort((a, b) => a.startAt.localeCompare(b.startAt));
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].endAt <= sorted[i].startAt, 'no overlaps');
  const firstDay = sorted.filter(b => utcToZoned(b.startAt, TZ).date === MON);
  assert.equal(firstDay[0].taskId, 'en', 'nearest test first');
  const perDay = new Map<string, number>();
  for (const b of res.blocks) { const d = utcToZoned(b.startAt, TZ).date; perDay.set(d, (perDay.get(d) ?? 0) + b.minutes); }
  for (const m of perDay.values()) assert.ok(m <= 90, 'respects daily maximum');
  assert.ok(res.blocks.filter(b => b.taskId === 'en').every(b => utcToZoned(b.startAt, TZ).date < '2026-11-25'));
});

test('scheduler: reports a shortfall instead of creating unrealistic blocks', () => {
  const res = planStudy({
    now: at(MON, '20:00'), tz: TZ, busy: [], prefs: DEFAULT_PREFS,
    tasks: [{ id: 'x', title: 'Physik', dueAt: at('2026-11-24', '08:00').toISOString(), remainingMinutes: 300, difficulty: 3, priority: 3 }],
  });
  // only the 30 minutes until the end of the study window fit – the rest is reported, not forced
  assert.equal(res.blocks.reduce((s, b) => s + b.minutes, 0), 30);
  assert.deepEqual(res.shortfalls, [{ taskId: 'x', missingMinutes: 270 }]);
});

test('scheduler: estimates', () => {
  assert.equal(estimateMinutes('test', 2), 120);
  assert.equal(estimateMinutes('schularbeit', 3), 270);
});

test('assistant: understands typical German commands', () => {
  assert.deepEqual(parseCommand('Ich habe nächsten Donnerstag einen Mathe-Test.', MON),
    { type: 'add_task', subject: 'Mathematik', kind: 'test', date: '2026-11-26', time: null });
  assert.deepEqual(parseCommand('CLOQI, ich habe am Freitag einen Englisch-Test.', MON),
    { type: 'add_task', subject: 'Englisch', kind: 'test', date: '2026-11-27', time: null });
  assert.deepEqual(parseCommand('BWL Schularbeit am 3.12.', MON),
    { type: 'add_task', subject: 'BWL', kind: 'schularbeit', date: '2026-12-03', time: null });
  assert.deepEqual(parseCommand('Trag morgen Training um 18 Uhr ein.', MON),
    { type: 'add_event', title: 'Training', category: 'training', date: '2026-11-24', start: '18:00', end: '19:30' });
  assert.deepEqual(parseCommand('Was habe ich morgen vor?', MON), { type: 'day_overview', date: '2026-11-24' });
  assert.equal(parseCommand('Wann habe ich Zeit zum Lernen?', MON).type, 'free_time');
  assert.deepEqual(parseCommand('Verschiebe meine Lernsession auf Mittwoch.', MON), { type: 'move_study', date: '2026-11-25', subject: null });
  assert.equal(parseCommand('Welche Tests stehen bald an?', MON).type, 'upcoming_tests');
  assert.deepEqual(parseCommand('Ich habe einen Mathe-Test', MON), { type: 'unknown', reason: 'no_date' });
  assert.equal(parseCommand('Wie ist das Wetter?', MON).type, 'unknown');
});

test('assistant: new calendar commands from the product spec', () => {
  assert.deepEqual(parseCommand('Plane mir nächste Woche drei Lernstunden für BWL ein.', MON),
    { type: 'plan_hours', subject: 'BWL', minutes: 180, from: '2026-11-30', to: '2026-12-06' });
  assert.deepEqual(parseCommand('Verschiebe mein Training auf Freitag.', MON), { type: 'move_event', keyword: 'training', date: '2026-11-27', time: null });
  assert.deepEqual(parseCommand('Zeig mir alle Termine der nächsten Woche.', MON), { type: 'list_range', from: '2026-11-30', to: '2026-12-06' });
  assert.deepEqual(parseCommand('Wann habe ich diese Woche Zeit für Freunde?', MON), { type: 'free_time', from: MON, to: '2026-11-29' });
  assert.deepEqual(parseCommand('Trag morgen um 17 Uhr Training ein.', MON),
    { type: 'add_event', title: 'Training', category: 'training', date: '2026-11-24', start: '17:00', end: '18:30' });
});

test('assistant: dates and times', () => {
  assert.equal(parseDate('am Montag', MON), '2026-11-30', 'same weekday means next week');
  assert.equal(parseDate('übermorgen', MON), '2026-11-25');
  assert.equal(parseDate('am 5. Jänner', MON), '2027-01-05');
  assert.equal(parseDate('in zwei Wochen', MON), '2026-12-07');
  assert.deepEqual(parseTimes('von 17 bis 19:30 Uhr'), { start: '17:00', end: '19:30' });
  assert.deepEqual(parseTimes('um 7.45'), { start: '07:45', end: null });
});

const WEBUNTIS_SAMPLE = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Untis//WebUntis//DE', 'X-WR-TIMEZONE:Europe/Vienna',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Vienna', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'END:STANDARD', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:lesson-1@webuntis', 'DTSTART;TZID=Europe/Vienna:20261126T100000', 'DTEND;TZID=Europe/Vienna:20261126T105000',
  'SUMMARY:Mathematik', 'LOCATION:R4DK', 'DESCRIPTION:Lehrer: HOF\\nKlasse 4AK', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:lesson-2@webuntis', 'DTSTART:20261126T070000Z', 'DTEND:20261126T075000Z',
  'SUMMARY:Englisch\\, Gruppe 1', 'LOCATION:R1', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('ics: parses WebUntis-style feeds incl. cancellations and escaped text', () => {
  const ev = parseIcs(WEBUNTIS_SAMPLE, TZ);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].status, 'CANCELLED');
  assert.equal(ev[0].start.toISOString(), '2026-11-26T09:00:00.000Z');
  assert.equal(ev[0].description, 'Lehrer: HOF\nKlasse 4AK');
  assert.equal(ev[1].summary, 'Englisch, Gruppe 1');
  assert.throws(() => parseIcs('hello', TZ));
});

test('ics: expands weekly RRULE and writes a feed that parses back', () => {
  const rec = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:r1', 'DTSTART;TZID=Europe/Vienna:20261020T170000', 'DTEND;TZID=Europe/Vienna:20261020T183000',
    'RRULE:FREQ=WEEKLY;COUNT=3', 'SUMMARY:Training', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const occ = parseIcs(rec, TZ, new Date('2027-01-01'));
  assert.equal(occ.length, 3);
  // 27 Oct and 3 Nov are after the DST switch – wall clock must stay 17:00
  assert.equal(utcToZoned(occ[2].start, TZ).time, '17:00');

  const feed = buildIcs('CLOQI', [{ uid: 'a@cloqi', title: 'Mathe lernen; Kapitel 4, Teil 2', start: new Date('2026-11-24T14:00:00Z'), end: new Date('2026-11-24T15:00:00Z'), description: 'x'.repeat(120) }]);
  const back = parseIcs(feed, TZ);
  assert.equal(back[0].summary, 'Mathe lernen; Kapitel 4, Teil 2');
  assert.equal(back[0].description, 'x'.repeat(120));
  assert.ok(feed.split('\r\n').every(l => Buffer.byteLength(l) <= 75));
});

test('conflicts: detects overlaps but ignores lesson-vs-lesson', () => {
  const item = (key: string, kind: CalendarItem['kind'], s: string, e: string): CalendarItem => ({
    key, kind, id: key, title: key, startAt: s, endAt: e, allDay: false, category: 'privat', status: 'active', source: 'manual',
    location: null, teacher: null, description: null, readOnly: false, taskId: null, reminderMinutes: null, calendarLabel: 'CLOQI',
    calendarId: null, calendarColor: null, recurring: false, occurrenceDate: null,
  });
  const c = findConflicts([
    item('l1', 'lesson', '2026-11-24T07:00:00Z', '2026-11-24T08:00:00Z'),
    item('l2', 'lesson', '2026-11-24T07:30:00Z', '2026-11-24T08:00:00Z'),
    item('arzt', 'event', '2026-11-24T07:45:00Z', '2026-11-24T08:30:00Z'),
    item('later', 'event', '2026-11-24T09:00:00Z', '2026-11-24T10:00:00Z'),
  ]);
  assert.deepEqual(c.map(x => `${x.a.key}-${x.b.key}`), ['l1-arzt', 'l2-arzt']);
});
