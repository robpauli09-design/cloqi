import 'server-only';
import { createTask } from './repo';
import { estimateMinutes } from './scheduler';
import { zonedToUtc } from './time';
import { TASK_KIND_LABELS, type TaskKind, type User } from './types';
import { InputError } from './validate';

export function createTaskFor(user: User, input: { subject: string; kind: TaskKind; day: string; time: string; difficulty: 1 | 2 | 3; minutes?: number; title?: string; notBefore?: string | null }): string {
  const dueAt = zonedToUtc(input.day, input.time, user.timezone).toISOString();
  if (dueAt <= new Date().toISOString()) throw new InputError('Der Termin liegt in der Vergangenheit.');
  const known = user.prefs.subjects.find(s => s.name.toLowerCase() === input.subject.toLowerCase());
  const difficulty = known?.difficulty ?? input.difficulty;
  return createTask(user.id, {
    title: input.title || `${TASK_KIND_LABELS[input.kind]} ${input.subject}`,
    subject: input.subject, kind: input.kind, dueAt, difficulty,
    estimatedMinutes: input.minutes ?? estimateMinutes(input.kind, difficulty),
    priority: input.kind === 'schularbeit' || input.kind === 'pruefung' ? 3 : 2,
    notBefore: input.notBefore ?? null,
  });
}
