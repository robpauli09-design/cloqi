import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { activeWorkout, exerciseProgress, lastSets, listTemplates, listWorkouts, sportHints, weekStats } from '@/lib/sport';
import { SportApp } from './SportApp';

export const metadata: Metadata = { title: 'Sport' };

export default async function SportPage() {
  const user = await requireReadyUser();
  const [templates, active, history, progress, week, hints] = await Promise.all([
    listTemplates(user.id), activeWorkout(user.id), listWorkouts(user.id, 12), exerciseProgress(user), weekStats(user), sportHints(user),
  ]);
  const ids = [...new Set([...(active?.exercises ?? []), ...templates.flatMap(t => t.exercises)].map(e => e.id))];
  return (
    <SportApp
      mascot={user.prefs.mascot} tz={user.timezone} templates={templates} active={active} history={history}
      progress={progress.slice(0, 12)} week={week} hints={hints} last={await lastSets(user.id, ids)}
    />
  );
}
