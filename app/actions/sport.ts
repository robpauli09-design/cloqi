'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import {
  deleteTemplate, deleteWorkout, finishWorkout, lastSets, saveTemplate, saveWorkout, scheduleTemplate, startWorkout,
  type Workout, type WorkoutSummary,
} from '@/lib/sport';
import { isUuid } from '@/lib/repo';
import { InputError } from '@/lib/validate';
import type { WorkoutExercise } from '@/lib/sport-data';

type R<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof InputError ? e.message : 'Das hat nicht geklappt. Bitte nochmal versuchen.' });
const id = (v: unknown) => { const s = String(v ?? ''); if (!isUuid(s)) throw new InputError('Ungültige Auswahl.'); return s; };
const done = () => revalidatePath('/sport');

export async function startWorkoutAction(templateId: string | null): Promise<R<Workout>> {
  try {
    const user = await requireUser();
    const w = await startWorkout(user.id, templateId ? id(templateId) : null);
    done();
    return { ok: true, data: w };
  } catch (e) { return fail(e); }
}

/** Autosave while training (no revalidate – the page keeps its own state). */
export async function saveWorkoutAction(workoutId: string, data: { name?: string; exercises: WorkoutExercise[]; note?: string | null }): Promise<R> {
  try { const user = await requireUser(); await saveWorkout(user.id, id(workoutId), data); return { ok: true }; } catch (e) { return fail(e); }
}

export async function finishWorkoutAction(workoutId: string, data: { exercises: WorkoutExercise[]; note?: string | null }): Promise<R<WorkoutSummary>> {
  try {
    const user = await requireUser();
    const s = await finishWorkout(user.id, id(workoutId), data);
    revalidatePath('/', 'layout');
    return { ok: true, data: s };
  } catch (e) { return fail(e); }
}

export async function deleteWorkoutAction(workoutId: string): Promise<R> {
  try { const user = await requireUser(); await deleteWorkout(user.id, id(workoutId)); done(); return { ok: true, message: 'Training gelöscht.' }; } catch (e) { return fail(e); }
}

export async function lastSetsAction(exerciseIds: string[]): Promise<Record<string, WorkoutExercise['sets']>> {
  const user = await requireUser();
  return lastSets(user.id, exerciseIds.slice(0, 40).map(String));
}

export async function saveTemplateAction(t: { id?: string | null; name: string; exercises: WorkoutExercise[] }): Promise<R<string>> {
  try {
    const user = await requireUser();
    const tid = await saveTemplate(user.id, { ...t, id: t.id ? id(t.id) : null });
    done();
    return { ok: true, data: tid, message: 'Vorlage gespeichert.' };
  } catch (e) { return fail(e); }
}

export async function deleteTemplateAction(templateId: string): Promise<R> {
  try { const user = await requireUser(); await deleteTemplate(user.id, id(templateId)); revalidatePath('/', 'layout'); return { ok: true, message: 'Vorlage gelöscht.' }; } catch (e) { return fail(e); }
}

/** Put a template into the calendar on weekdays (or remove it with null). */
export async function scheduleTemplateAction(templateId: string, s: { weekdays: number[]; time: string; minutes: number } | null): Promise<R> {
  try {
    const user = await requireUser();
    await scheduleTemplate(user, id(templateId), s);
    revalidatePath('/', 'layout');
    return { ok: true, message: s?.weekdays.length ? 'Im Kalender eingeplant – CLOQI plant Lernzeit drumherum.' : 'Aus dem Kalender entfernt.' };
  } catch (e) { return fail(e); }
}
