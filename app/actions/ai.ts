'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { chatFor, transcribe, type ChatReply } from '@/lib/ai';
import { deleteThread, deleteVaultFile, getThread, getVaultFile, listChat, listThreads, writeVaultFile, type ChatThread } from '@/lib/repo';
import { normalizePath, readVaultFile, userCanDelete, userCanWrite } from '@/lib/vault';
import type { ActionResult } from '@/lib/validate';

/** Sends one message to CLOQI AI (tool-using agent). threadId null = new conversation. */
export async function chatWithCloqi(message: string, threadId: string | null = null, attachments: unknown = []): Promise<ChatReply> {
  const user = await requireUser();
  const r = await chatFor(user, message, { threadId, attachments });
  if (r.actions.length) revalidatePath('/', 'layout');
  return r;
}

/** Voice input: recorded audio (FormData field "audio") → text. */
export async function transcribeAction(form: FormData): Promise<{ ok: boolean; text?: string; error?: string }> {
  const user = await requireUser();
  const file = form.get('audio');
  if (!(file instanceof Blob) || !file.size) return { ok: false, error: 'Keine Aufnahme erhalten.' };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: 'Die Aufnahme ist zu lang.' };
  const name = file instanceof File && /\.(m4a|mp4|webm|wav|mp3|ogg)$/i.test(file.name) ? file.name : 'aufnahme.webm';
  try { return { ok: true, text: await transcribe(file, name, user.id) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Spracherkennung fehlgeschlagen.' }; }
}

/** Chat history: the user's conversations, newest first. */
export async function listThreadsAction(): Promise<ChatThread[]> {
  const user = await requireUser();
  return listThreads(user.id);
}

export async function openThreadAction(id: string): Promise<{ ok: boolean; messages: { id: string; role: 'user' | 'assistant'; content: string }[] }> {
  const user = await requireUser();
  if (!(await getThread(user.id, String(id)))) return { ok: false, messages: [] };
  return { ok: true, messages: (await listChat(user.id, String(id), 200)).map(m => ({ id: m.id, role: m.role, content: m.content })) };
}

export async function deleteThreadAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await deleteThread(user.id, String(id));
  return { ok: true, message: 'Chat gelöscht. Was CLOQI über dich weiß (Wissen), bleibt erhalten.' };
}

// ---------- vault ----------

export async function openVaultFile(path: string): Promise<{ ok: boolean; content?: string; error?: string }> {
  const user = await requireUser();
  try {
    const p = normalizePath(path);
    const content = await readVaultFile(user, p);
    return content === null ? { ok: false, error: 'Datei nicht gefunden.' } : { ok: true, content };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Fehler' }; }
}

export async function saveVaultFile(path: string, content: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const p = normalizePath(path);
    if (!userCanWrite(p)) return { ok: false, error: 'Diese Datei kannst du nicht bearbeiten.' };
    if (content.length > 100000) return { ok: false, error: 'Die Datei ist zu groß (max. 100.000 Zeichen).' };
    await writeVaultFile(user.id, p, content, 'user');
    revalidatePath('/vault');
    return { ok: true, message: 'Gespeichert.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Fehler' }; }
}

export async function createVaultNote(path: string): Promise<ActionResult & { path?: string }> {
  const user = await requireUser();
  try {
    const p = normalizePath(path);
    if (!userCanWrite(p)) return { ok: false, error: 'Hier kannst du keine Datei anlegen (wiki/ gehört CLOQI).' };
    if (await getVaultFile(user.id, p)) return { ok: false, error: 'Diese Datei gibt es schon.' };
    await writeVaultFile(user.id, p, `# ${p.split('/').pop()!.replace(/\.md$/, '')}\n\n`, 'user');
    revalidatePath('/vault');
    return { ok: true, message: 'Notiz angelegt.', path: p };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Fehler' }; }
}

export async function deleteVaultFileAction(path: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const p = normalizePath(path);
    if (!userCanDelete(p)) return { ok: false, error: 'Diese Datei kann nicht gelöscht werden.' };
    await deleteVaultFile(user.id, p);
    revalidatePath('/vault');
    return { ok: true, message: 'Gelöscht.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Fehler' }; }
}
