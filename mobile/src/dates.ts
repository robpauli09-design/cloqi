// Pure date-string helpers (YYYY-MM-DD). Time zones are handled by the server.

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const parse = (d: string) => new Date(`${d}T12:00:00Z`);
export const addDays = (d: string, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/** 1 = Monday … 7 = Sunday */
export const weekday = (d: string) => { const j = parse(d).getUTCDay(); return j === 0 ? 7 : j; };
export const startOfWeek = (d: string) => addDays(d, 1 - weekday(d));
export const dayNum = (d: string) => Number(d.slice(8, 10));
export const formatLong = (d: string) => `${WEEKDAYS[weekday(d) - 1]}, ${dayNum(d)}. ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const monthYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const relativeDay = (d: string, today: string) =>
  d === today ? 'Heute' : d === addDays(today, 1) ? 'Morgen' : d === addDays(today, -1) ? 'Gestern' : formatLong(d);

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
}
