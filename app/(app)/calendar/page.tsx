import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { getCalendarItems, dayRange } from '@/lib/calendar';
import { summarize } from '@/lib/cycle';
import { hasCycleConsent, listCalendars, listCycleEntries } from '@/lib/repo';
import { addDays, isValidDate, startOfMonth, startOfWeek, todayIn, zonedToUtc } from '@/lib/time';
import type { CalendarItem } from '@/lib/types';
import { CalendarApp, type CalendarView } from '@/components/calendar/CalendarApp';

export const metadata: Metadata = { title: 'Kalender' };

const VIEWS: CalendarView[] = ['day', 'week', 'month', 'agenda'];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireReadyUser();
  const sp = await searchParams;
  const tz = user.timezone;
  const today = todayIn(tz);
  const view = (VIEWS.includes(sp.view as CalendarView) ? sp.view : 'week') as CalendarView;
  const date = sp.date && isValidDate(sp.date) ? sp.date : today;
  const filter = sp.filter ?? 'week';

  let fromDay: string;
  let toDay: string; // exclusive
  if (view === 'day') { fromDay = date; toDay = addDays(date, 1); }
  else if (view === 'week') { fromDay = startOfWeek(date); toDay = addDays(fromDay, 7); }
  else if (view === 'month') { fromDay = startOfWeek(startOfMonth(date)); toDay = addDays(fromDay, 42); }
  else {
    const endOfWeek = addDays(startOfWeek(today), 7);
    const ranges: Record<string, [string, string]> = {
      today: [today, addDays(today, 1)],
      tomorrow: [addDays(today, 1), addDays(today, 2)],
      week: [today, endOfWeek],
      nextweek: [endOfWeek, addDays(endOfWeek, 7)],
      month: [today, addDays(startOfMonth(addDays(startOfMonth(today), 32)), 0)],
      custom: [sp.from && isValidDate(sp.from) ? sp.from : today, sp.to && isValidDate(sp.to) ? addDays(sp.to, 1) : addDays(today, 30)],
    };
    [fromDay, toDay] = ranges[filter] ?? ranges.week;
    if (toDay <= fromDay) toDay = addDays(fromDay, 1);
    if (Date.parse(toDay) - Date.parse(fromDay) > 370 * 86400000) toDay = addDays(fromDay, 370);
  }
  const from = zonedToUtc(fromDay, '00:00', tz).toISOString();
  const to = zonedToUtc(toDay, '00:00', tz).toISOString();
  const items = (await getCalendarItems(user, from, to)).filter(i => i.status !== 'missed' || view !== 'agenda');

  // Cycle overlay: shown only inside CLOQI, never exported or synced.
  if (user.prefs.cycleEnabled && user.prefs.cycleInCalendar && await hasCycleConsent(user.id)) {
    const s = summarize(await listCycleEntries(user.id), today);
    if (s.nextStart) {
      for (let i = 0; i < s.periodLength; i++) {
        const d = addDays(s.nextStart, i);
        if (d < fromDay || d >= toDay) continue;
        const r = dayRange(d, tz);
        items.push(overlay(`cycle:${d}`, i === 0 ? 'Periode (geschätzt)' : 'Periode', r.from, r.to));
      }
    }
  }

  return (
    <CalendarApp
      view={view} explicitView={Boolean(sp.view)} date={date} today={today} tz={tz} filter={filter} rangeFrom={fromDay} rangeTo={addDays(toDay, -1)}
      items={items} calendars={await listCalendars(user.id)} mascot={user.prefs.mascot} reminderDefault={user.prefs.reminderDefault}
    />
  );
}

function overlay(key: string, title: string, startAt: string, endAt: string): CalendarItem {
  return {
    key, kind: 'event', id: key, title, startAt, endAt, allDay: true, category: 'privat', status: 'active', source: 'cycle',
    location: null, teacher: null, description: 'Schätzung aus deinen CYCLE-Einträgen. Nur in CLOQI sichtbar.', readOnly: true,
    taskId: null, reminderMinutes: null, calendarLabel: 'Cycle (privat)', calendarId: null, calendarColor: '#E06A9E', recurring: false, occurrenceDate: null,
  };
}
