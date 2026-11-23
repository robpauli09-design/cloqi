import { buildDashboard } from '@/lib/insights';
import { appItem, json, withUser } from '@/lib/mobile-api';
import { getProgress } from '@/lib/stats';
import { utcToZoned } from '@/lib/time';

/** The "Heute" screen: same data as the website dashboard. */
export const GET = withUser(async user => {
  const tz = user.timezone;
  const [d, p] = await Promise.all([buildDashboard(user), getProgress(user)]);
  const item = (i: Parameters<typeof appItem>[0] | null) => (i ? appItem(i, tz) : null);
  return json({
    today: d.today,
    insight: d.insight,
    items: d.items.map(i => appItem(i, tz)),
    nextLesson: item(d.nextLesson),
    nextEvent: item(d.nextEvent),
    studyToday: d.studyToday.map(i => appItem(i, tz)),
    openTasks: d.openTasks.slice(0, 5).map(t => ({ id: t.id, title: t.title, subject: t.subject, kind: t.kind, due: utcToZoned(t.dueAt, tz).date })),
    freeToday: d.freeToday,
    suggestions: d.suggestions.map(s => ({ id: s.id, kind: s.kind, message: s.message })),
    progress: { todayMinutes: p.todayMinutes, dailyGoal: p.dailyGoal, streak: p.streak, weekDone: p.weekDone, weekPlanned: p.weekPlanned },
  });
});
