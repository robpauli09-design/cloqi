import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { listBlocks, listTasks } from '@/lib/repo';
import { todayIn } from '@/lib/time';
import { AssistantInline } from '@/components/AssistantInline';
import { Mascot } from '@/components/Mascot';
import { LearnBoard } from './LearnBoard';

export const metadata: Metadata = { title: 'Learn' };

export default async function LearnPage() {
  const user = await requireReadyUser();
  const tasks = await listTasks(user.id);
  const blocks = await listBlocks(user.id);
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="eyebrow">Learn</p>
          <h1 className="h1">Lernplanung</h1>
          <p className="muted mt-1 max-w-xl">Trag Tests, Schularbeiten und Hausübungen ein – CLOQI plant realistische Lernblöcke rund um Unterricht, Training und Freizeit.</p>
        </div>
        <Mascot name={user.prefs.mascot} variant="bust" size={110} className="hidden sm:block" />
      </header>
      <AssistantInline mascot={user.prefs.mascot} placeholder="z. B. „Ich habe am Donnerstag einen Mathe-Test“" />
      <LearnBoard tasks={tasks} blocks={blocks} tz={user.timezone} today={todayIn(user.timezone)} subjects={user.prefs.subjects} mascot={user.prefs.mascot} />
    </div>
  );
}
