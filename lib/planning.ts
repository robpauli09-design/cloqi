import 'server-only';
import { busyIntervals, getCalendarItems } from './calendar';
import { addSuggestion, deleteBlocks, insertBlocks, listBlocks, listTasks, updateBlock } from './repo';
import { planStudy, type PlannedBlock } from './scheduler';
import { utcToZoned } from './time';
import type { User } from './types';

const HORIZON_DAYS = 60;
const minutesOf = (b: { startAt: string; endAt: string }) => Math.round((Date.parse(b.endAt) - Date.parse(b.startAt)) / 60000);

export interface PlanProposal {
  blocks: (PlannedBlock & { taskTitle: string; subject: string })[];
  shortfalls: { taskId: string; taskTitle: string; missingMinutes: number }[];
  replacedBlockIds: string[];
}

/**
 * Builds a study plan without saving it.
 * - scope "task": plans only the given task and keeps every existing block.
 * - scope "all": re-plans every open task; future planned blocks are replaced.
 */
export async function proposePlan(user: User, scope: { kind: 'task'; taskId: string } | { kind: 'all' }, now = new Date()): Promise<PlanProposal> {
  const tasks = (await listTasks(user.id, { openOnly: true })).filter(t => t.dueAt > now.toISOString());
  const target = scope.kind === 'task' ? tasks.filter(t => t.id === scope.taskId) : tasks;
  const nowIso = now.toISOString();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000).toISOString();
  const allBlocks = await listBlocks(user.id);

  const replaced = new Set<string>(
    allBlocks
      .filter(b => b.status === 'planned' && b.startAt >= nowIso && target.some(t => t.id === b.taskId))
      .map(b => b.id),
  );
  // When planning a single new task we keep its existing blocks and only add what is missing.
  if (scope.kind === 'task') replaced.clear();

  const items = await getCalendarItems(user, nowIso, horizon, { includeHidden: true });
  const busy = busyIntervals(items, { excludeStudyIds: replaced });

  const planTasks = target.map(t => {
    const counted = allBlocks.filter(b => b.taskId === t.id && (b.status === 'done' || (b.status === 'planned' && !replaced.has(b.id) && b.endAt > nowIso)));
    const done = counted.reduce((s, b) => s + minutesOf(b), 0);
    return { id: t.id, title: t.title, dueAt: t.dueAt, remainingMinutes: Math.max(0, t.estimatedMinutes - done), difficulty: t.difficulty, priority: t.priority, notBefore: t.notBefore };
  }).filter(t => t.remainingMinutes > 0);

  const result = planStudy({ now, tz: user.timezone, tasks: planTasks, busy, prefs: user.prefs });
  const byId = new Map(target.map(t => [t.id, t]));
  return {
    blocks: result.blocks.map(b => ({ ...b, taskTitle: byId.get(b.taskId)!.title, subject: byId.get(b.taskId)!.subject })),
    shortfalls: result.shortfalls.map(s => ({ ...s, taskTitle: byId.get(s.taskId)!.title })),
    replacedBlockIds: [...replaced],
  };
}

export async function applyPlan(user: User, proposal: PlanProposal) {
  if (proposal.replacedBlockIds.length) await deleteBlocks(user.id, proposal.replacedBlockIds);
  await insertBlocks(user.id, proposal.blocks.map(b => ({ taskId: b.taskId, startAt: b.startAt, endAt: b.endAt, note: b.label })));
}

/** Marks past planned blocks as missed and suggests a re-plan (once per block). */
export async function detectMissedBlocks(user: User, now = new Date()) {
  const nowIso = now.toISOString();
  const tasks = new Map((await listTasks(user.id)).map(t => [t.id, t]));
  for (const b of await listBlocks(user.id)) {
    if (b.status !== 'planned' || b.endAt > nowIso) continue;
    await updateBlock(user.id, b.id, { status: 'missed' });
    const task = tasks.get(b.taskId);
    if (!task || task.status !== 'open' || task.dueAt <= nowIso) continue;
    const when = utcToZoned(b.startAt, user.timezone);
    await addSuggestion(user.id, 'missed',
      `Du hast deinen ${task.subject}-Lernblock (${when.time} Uhr) verpasst. Soll ich die Zeit neu einplanen?`,
      { action: 'replan', taskId: task.id }, `missed:${b.id}`);
  }
}
