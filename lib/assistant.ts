// Understands short German calendar commands ("Ich habe am Freitag einen Englisch-Test").
// Pure and rule-based: it never invents data, it only turns text into a proposed action
// that the user confirms. A server-side LLM can later replace parseCommand behind the same type.

import type { Category, TaskKind } from './types.ts';
import { addDays, isValidDate, pad, weekdayOf } from './time.ts';

export type Intent =
  | { type: 'add_task'; subject: string; kind: TaskKind; date: string; time: string | null }
  | { type: 'add_event'; title: string; category: Category; date: string; start: string; end: string }
  | { type: 'day_overview'; date: string }
  | { type: 'free_time'; from: string; to: string }
  | { type: 'move_study'; date: string; subject: string | null }
  | { type: 'upcoming_tests' }
  | { type: 'replan' }
  | { type: 'plan_hours'; subject: string; minutes: number; from: string; to: string }
  | { type: 'move_event'; keyword: string; date: string; time: string | null }
  | { type: 'list_range'; from: string; to: string }
  | { type: 'unknown'; reason: 'no_date' | 'no_match' };

const WEEKDAYS: Record<string, number> = {
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 7,
};
const MONTHS: Record<string, number> = {
  jänner: 1, januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, april: 4, apr: 4, mai: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10,
  november: 11, nov: 11, dezember: 12, dez: 12,
};

const SUBJECTS: [RegExp, string][] = [
  [/\bmathe(matik)?\b/, 'Mathematik'], [/\bam (test|schularbeit|sa|prüfung)\b/, 'Angewandte Mathematik'],
  [/\benglisch\b|\be (test|schularbeit|sa)\b/, 'Englisch'], [/\bdeutsch\b|\bd (test|schularbeit|sa)\b/, 'Deutsch'],
  [/\bfranzösisch\b|\bfranz\b/, 'Französisch'], [/\bspanisch\b/, 'Spanisch'], [/\bitalienisch\b/, 'Italienisch'],
  [/\blatein\b/, 'Latein'], [/\bbwl\b|betriebswirtschaft/, 'BWL'], [/\bvwl\b|volkswirtschaft/, 'VWL'],
  [/\brechnungswesen\b|\brw\b/, 'Rechnungswesen'], [/\bbio(logie)?\b/, 'Biologie'], [/\bchemie\b/, 'Chemie'],
  [/\bphysik\b/, 'Physik'], [/\bgeschichte\b|\bgschichte\b/, 'Geschichte'], [/\bgeo(grafie|graphie)?\b|\bgwk\b/, 'Geografie'],
  [/\binformatik\b|\binfo\b/, 'Informatik'], [/\bwirtschaft\b/, 'Wirtschaft'], [/\brecht\b/, 'Recht'],
  [/\breligion\b|\breli\b/, 'Religion'], [/\bpsychologie\b|\bpsycho\b/, 'Psychologie'], [/\bphilosophie\b/, 'Philosophie'],
  [/\bmusik\b/, 'Musik'], [/\bkunst\b/, 'Kunst'], [/\bstatistik\b/, 'Statistik'], [/\bprogrammieren\b/, 'Programmieren'],
];

const KINDS: [RegExp, TaskKind][] = [
  [/schularbeit|\bsa\b/, 'schularbeit'],
  [/prüfung|pruefung|klausur|matura|examen/, 'pruefung'],
  [/referat|präsentation|praesentation/, 'referat'],
  [/hausübung|hausuebung|hausaufgabe|\bhü\b|\bhue\b/, 'hausuebung'],
  [/test|quiz|lernzielkontrolle|\blzk\b/, 'test'],
];

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[!?„“"]/g, ' ').replace(/(\w)-(\w)/g, '$1 $2').replace(/\s+/g, ' ').trim()} `;
}

/** Finds a date in the text relative to `today` (YYYY-MM-DD). */
export function parseDate(text: string, today: string): string | null {
  const t = normalize(text);
  // note: \b does not treat "ü" as a word character, so match on whitespace instead
  if (/\s(über|ueber)morgen\s/.test(t)) return addDays(today, 2);
  if (/\bmorgen\b/.test(t) && !/\bmorgens\b/.test(t)) return addDays(today, 1);
  if (/\bheute\b/.test(t)) return today;
  const inDays = t.match(/\bin (\d+|einem|einer|zwei|drei) (tag|tagen|woche|wochen)\b/);
  if (inDays) {
    const n = ({ einem: 1, einer: 1, zwei: 2, drei: 3 } as Record<string, number>)[inDays[1]] ?? Number(inDays[1]);
    return addDays(today, inDays[2].startsWith('woche') ? n * 7 : n);
  }
  const numeric = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (numeric) return withYear(Number(numeric[1]), Number(numeric[2]), numeric[3], today);
  const named = t.match(/\b(\d{1,2})\.? ([a-zäöü]+)\b/);
  if (named && MONTHS[named[2]]) return withYear(Number(named[1]), MONTHS[named[2]], undefined, today);
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    const re = new RegExp(`\\b${name}s?\\b`);
    if (re.test(t)) {
      const todayWd = weekdayOf(today);
      let diff = (wd - todayWd + 7) % 7;
      if (diff === 0) diff = 7;
      if (/\bnächste woche\b|\bnaechste woche\b/.test(t) && diff <= 7 - todayWd) diff += 7;
      return addDays(today, diff);
    }
  }
  return null;
}

function withYear(d: number, m: number, y: string | undefined, today: string): string | null {
  let year = y ? Number(y.length === 2 ? `20${y}` : y) : Number(today.slice(0, 4));
  let date = `${year}-${pad(m)}-${pad(d)}`;
  if (!isValidDate(date) || Number(date.slice(8)) !== d) return null;
  if (!y && date < today) { year += 1; date = `${year}-${pad(m)}-${pad(d)}`; }
  return date;
}

/** Finds a clock time or range: "um 18 Uhr", "18:30", "von 17 bis 19 Uhr". */
export function parseTimes(text: string): { start: string | null; end: string | null } {
  const t = normalize(text);
  const fmt = (h: string, m?: string) => `${pad(Number(h))}:${pad(Number(m ?? 0))}`;
  const range = t.match(/\b(?:von )?(\d{1,2})(?:[:.](\d{2}))?(?: uhr)? (?:bis|-) (\d{1,2})(?:[:.](\d{2}))?(?: uhr)?\b/);
  if (range && Number(range[1]) < 24 && Number(range[3]) < 24) return { start: fmt(range[1], range[2]), end: fmt(range[3], range[4]) };
  const single = t.match(/\bum (\d{1,2})(?:[:.](\d{2}))?\b/) || t.match(/\b(\d{1,2})(?:[:.](\d{2}))? uhr\b/) || t.match(/\b(\d{1,2})[:](\d{2})\b/);
  if (single && Number(single[1]) < 24) return { start: fmt(single[1], single[2]), end: null };
  return { start: null, end: null };
}

export function detectSubject(text: string, known: string[] = []): string | null {
  const t = normalize(text);
  for (const k of known) {
    if (k && t.includes(` ${k.toLowerCase()} `)) return k;
  }
  for (const [re, name] of SUBJECTS) if (re.test(t)) return name;
  // "Test in XY" / "XY-Test" fallback with capitalised word from the original text
  const m = text.match(/([A-ZÄÖÜ][\wäöüß]+)[- ]?(?:Test|Schularbeit|Prüfung|Klausur|Referat)/) || text.match(/(?:Test|Schularbeit|Prüfung|Klausur|Referat) (?:in|aus) ([A-ZÄÖÜ][\wäöüß]+)/);
  return m ? m[1] : null;
}

function detectKind(t: string): TaskKind | null {
  for (const [re, kind] of KINDS) if (re.test(t)) return kind;
  return null;
}

const EVENT_CATEGORIES: [RegExp, Category, string][] = [
  [/training|trainieren|fußball|fussball|handball|basketball|volleyball|tennis|schwimmen|gym|fitness|laufen|joggen|sport|turnen|tanzen/, 'training', 'Training'],
  [/arbeit|arbeiten|schicht|job|nebenjob|praktikum/, 'arbeit', 'Arbeit'],
  [/geburtstag|party|kino|freunde|treffen|essen gehen|ausgehen|konzert|chillen/, 'freizeit', 'Freizeit'],
  [/arzt|zahnarzt|termin|friseur|fahrstunde|nachhilfe|musikschule|probe/, 'privat', 'Termin'],
];

function eventTitle(original: string, t: string, fallback: string): string {
  const known = ['Training', 'Fußball', 'Handball', 'Basketball', 'Volleyball', 'Tennis', 'Schwimmen', 'Gym', 'Fitness', 'Laufen',
    'Arbeit', 'Schicht', 'Praktikum', 'Geburtstag', 'Party', 'Kino', 'Arzt', 'Zahnarzt', 'Friseur', 'Fahrstunde', 'Nachhilfe', 'Musikschule', 'Konzert'];
  const hit = known.find(k => t.includes(` ${k.toLowerCase()}`));
  if (hit) {
    const bday = original.match(/Geburtstag (?:von )?([A-ZÄÖÜ][\wäöüß]+)/);
    if (hit === 'Geburtstag' && bday) return `Geburtstag ${bday[1]}`;
    return hit;
  }
  return fallback;
}

const NUMBERS: Record<string, number> = { eine: 1, einen: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, zehn: 10, halbe: 0.5 };

function weekRange(t: string, today: string): { from: string; to: string } {
  const toSunday = 7 - weekdayOf(today);
  if (/nächste[nr]? woche|naechste[nr]? woche/.test(t)) {
    const from = addDays(today, toSunday + 1);
    return { from, to: addDays(from, 6) };
  }
  return { from: today, to: addDays(today, toSunday) };
}

export function parseCommand(text: string, today: string, knownSubjects: string[] = []): Intent {
  const t = normalize(text);
  if (!t.trim()) return { type: 'unknown', reason: 'no_match' };

  // "Plane mir nächste Woche drei Lernstunden für BWL ein."
  const hours = t.match(/(\d+(?:[.,]\d)?|eine?n?|zwei|drei|vier|fünf|sechs|sieben|acht|zehn|halbe) (lern ?stunden?|stunden? lernen|stunden? lernzeit|lernstunde)/);
  if (hours && /plan|reservier|blocke?|trag|einplan/.test(t)) {
    const n = NUMBERS[hours[1]] ?? Number(hours[1].replace(',', '.'));
    const subject = detectSubject(text, knownSubjects) ?? 'Allgemein';
    const { from, to } = weekRange(t, today);
    return { type: 'plan_hours', subject, minutes: Math.round(n * 60), from, to };
  }

  // "Zeig mir alle Termine der nächsten Woche."
  if (/(zeig|liste|welche|alle) .*termine/.test(t) && !/wann/.test(t)) {
    if (/woche/.test(t)) return { type: 'list_range', ...weekRange(t, today) };
    const d = parseDate(text, today);
    if (d) return { type: 'day_overview', date: d };
    return { type: 'list_range', ...weekRange(t, today) };
  }

  if (/(neu|nochmal) (planen|plan)|plan(e)? (alles )?neu|lernplan (anpassen|aktualisieren)/.test(t)) return { type: 'replan' };

  if (/welche (tests|prüfungen|schularbeiten)|(tests|prüfungen|schularbeiten) stehen|nächste[rn]? (test|prüfung|schularbeit)|was (kommt|steht) (bald|demnächst)/.test(t)) {
    return { type: 'upcoming_tests' };
  }

  if (/verschieb/.test(t) && /lern|session|block|einheit/.test(t)) {
    const date = parseDate(text.replace(/verschieb\w*/i, ''), today);
    if (!date) return { type: 'unknown', reason: 'no_date' };
    return { type: 'move_study', date, subject: detectSubject(text, knownSubjects) };
  }
  // "Verschiebe mein Training auf Freitag (um 18 Uhr)."
  const move = t.match(/verschieb\w* (?:mein(?:en|e)?|den|die|das) ([a-zäöüß]+)/);
  if (move) {
    const date = parseDate(text.replace(/verschieb\w*/i, ''), today);
    if (!date) return { type: 'unknown', reason: 'no_date' };
    return { type: 'move_event', keyword: move[1], date, time: parseTimes(text).start };
  }

  if (/wann (habe|hab|hätte) ich .*(zeit|frei)|wann kann ich lernen|freie zeit|freizeit (diese|nächste)|zeit zum lernen|zeit für freunde/.test(t)) {
    const nextWeek = /nächste woche|naechste woche/.test(t);
    const date = parseDate(text, today);
    if (date && !/woche/.test(t)) return { type: 'free_time', from: date, to: date };
    const from = nextWeek ? addDays(today, 8 - weekdayOf(today)) : today;
    return { type: 'free_time', from, to: addDays(from, nextWeek ? 6 : 7 - weekdayOf(today)) };
  }

  if (/was (habe|hab|steht|ist|mach) ich|was steht|wie sieht (mein|der)/.test(t) && /(vor|an|los|plan|tag|heute|morgen|\b\w+tag\b)/.test(t)) {
    return { type: 'day_overview', date: parseDate(text, today) ?? today };
  }

  const kind = detectKind(t);
  const subject = detectSubject(text, knownSubjects);
  if (kind && (subject || kind !== 'test') && !/trag .* (training|arbeit)/.test(t)) {
    const date = parseDate(text, today);
    if (!date) return { type: 'unknown', reason: 'no_date' };
    const { start } = parseTimes(text);
    return { type: 'add_task', subject: subject ?? 'Allgemein', kind, date, time: start };
  }

  const cat = EVENT_CATEGORIES.find(([re]) => re.test(t));
  if (cat || /trag|eintragen|termin|füge|hinzu|plane? /.test(t)) {
    const date = parseDate(text, today);
    if (!date) return { type: 'unknown', reason: 'no_date' };
    const { start, end } = parseTimes(text);
    const category = cat?.[1] ?? 'privat';
    const s = start ?? (category === 'training' ? '17:00' : '18:00');
    const duration = category === 'training' ? 90 : category === 'arbeit' ? 240 : 60;
    const [h, m] = s.split(':').map(Number);
    const endMin = Math.min(23 * 60 + 59, h * 60 + m + duration);
    return {
      type: 'add_event',
      title: eventTitle(text, t, cat?.[2] ?? 'Termin'),
      category,
      date,
      start: s,
      end: end ?? `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`,
    };
  }

  return { type: 'unknown', reason: 'no_match' };
}
