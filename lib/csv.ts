// CSV timetable import: "Fach;Wochentag;Beginn;Ende;Raum;Lehrer" (header optional, ; or , separated).

import { isValidTime, pad } from './time.ts';

export interface CsvLesson { subject: string; weekday: number; startTime: string; endTime: string; room: string | null; teacher: string | null }
export interface CsvResult { lessons: CsvLesson[]; errors: string[] }

const DAYS: Record<string, number> = {
  mo: 1, montag: 1, monday: 1, di: 2, dienstag: 2, tuesday: 2, mi: 3, mittwoch: 3, wednesday: 3,
  do: 4, donnerstag: 4, thursday: 4, fr: 5, freitag: 5, friday: 5, sa: 6, samstag: 6, saturday: 6, so: 7, sonntag: 7, sunday: 7,
};

function time(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const t = `${pad(Number(m[1]))}:${m[2]}`;
  return isValidTime(t) ? t : null;
}

export function parseTimetableCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lessons: CsvLesson[] = [];
  const errors: string[] = [];
  if (!lines.length) return { lessons, errors: ['Die Datei ist leer.'] };
  const sep = lines[0].includes(';') ? ';' : ',';
  lines.forEach((line, i) => {
    const cells = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /fach|subject/i.test(cells[0])) return;
    const [subject, day, start, end, room, teacher] = cells;
    const weekday = DAYS[(day || '').toLowerCase().replace('.', '')] ?? (Number(day) >= 1 && Number(day) <= 7 ? Number(day) : NaN);
    const s = time(start || ''), e = time(end || '');
    if (!subject || Number.isNaN(weekday) || !s || !e || e <= s) {
      errors.push(`Zeile ${i + 1}: „${line}“ konnte nicht gelesen werden.`);
      return;
    }
    lessons.push({ subject: subject.slice(0, 80), weekday, startTime: s, endTime: e, room: room || null, teacher: teacher || null });
  });
  return { lessons, errors };
}
