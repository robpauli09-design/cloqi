'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { applyPlan, proposePlan, type PlanProposal } from '@/lib/planning';
import { deleteTask, getTask, setTaskStatus } from '@/lib/repo';
import { createTaskFor } from '@/lib/tasks';
import { TASK_KIND_LABELS, type TaskKind } from '@/lib/types';
import { date, fail, int, InputError, text, type ActionResult } from '@/lib/validate';

export type PlanResult = ActionResult & { proposal?: PlanProposal; taskId?: string };

const KINDS = Object.keys(TASK_KIND_LABELS) as TaskKind[];


export async function addTaskAction(_prev: PlanResult | null, form: FormData): Promise<PlanResult> {
  try {
    const user = await requireUser();
    const kind = String(form.get('kind')) as TaskKind;
    if (!KINDS.includes(kind)) throw new InputError('Bitte wähle eine Art.');
    const minutesRaw = String(form.get('minutes') ?? '');
    const taskId = createTaskFor(user, {
      subject: text(form, 'subject', { required: true, max: 60, label: 'Fach' }),
      kind,
      day: date(form, 'date'),
      time: String(form.get('time') || '08:00'),
      difficulty: int(form, 'difficulty', 1, 3, 2) as 1 | 2 | 3,
      minutes: minutesRaw ? int(form, 'minutes', 15, 1200) : undefined,
      title: text(form, 'title', { max: 120 }) || undefined,
    });
    revalidatePath('/', 'layout');
    return { ok: true, taskId, proposal: proposePlan(user, { kind: 'task', taskId }) };
  } catch (e) { return fail(e); }
}

export async function previewTaskPlan(taskId: string): Promise<PlanResult> {
  try {
    const user = await requireUser();
    if (!getTask(user.id, taskId)) throw new InputError('Aufgabe nicht gefunden.');
    return { ok: true, taskId, proposal: proposePlan(user, { kind: 'task', taskId }) };
  } catch (e) { return fail(e); }
}

export async function applyTaskPlan(taskId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!getTask(user.id, taskId)) throw new InputError('Aufgabe nicht gefunden.');
    const p = proposePlan(user, { kind: 'task', taskId });
    applyPlan(user, p);
    revalidatePath('/', 'layout');
    return { ok: true, message: p.blocks.length ? `${p.blocks.length} Lernblöcke eingeplant.` : 'Es war kein freier Zeitraum verfügbar.' };
  } catch (e) { return fail(e); }
}

export async function previewReplanAll(): Promise<PlanResult> {
  try {
    const user = await requireUser();
    return { ok: true, proposal: proposePlan(user, { kind: 'all' }) };
  } catch (e) { return fail(e); }
}

export async function applyReplanAll(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const p = proposePlan(user, { kind: 'all' });
    applyPlan(user, p);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Lernplan aktualisiert.' };
  } catch (e) { return fail(e); }
}

export async function setTaskDone(id: string, done: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    setTaskStatus(user.id, id, done ? 'done' : 'open');
    revalidatePath('/', 'layout');
    return { ok: true, message: done ? 'Erledigt – stark!' : 'Wieder offen.' };
  } catch (e) { return fail(e); }
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    deleteTask(user.id, id);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Gelöscht, inklusive Lernblöcken.' };
  } catch (e) { return fail(e); }
}
