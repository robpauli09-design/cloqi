'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { aiConfig, runAgent } from '@/lib/ai';
import { clearChat, deleteVaultFile, getVaultFile, writeVaultFile } from '@/lib/repo';
import { normalizePath, readVaultFile, userCanDelete, userCanWrite } from '@/lib/vault';
import type { ActionResult } from '@/lib/validate';

export interface ChatReply { ok: boolean; reply: string; actions: string[] }

const lastCall = new Map<string, number>();

/** Sends one message to CLOQI AI (tool-using agent). */
export async function chatWithCloqi(message: string): Promise<ChatReply> {
  const user = await requireUser();
  const text = String(message ?? '').trim().slice(0, 2000);
  if (!text) return { ok: false, reply: 'Schreib mir etwas 🙂', actions: [] };
  if (!aiConfig()) return { ok: false, reply: 'CLOQI AI ist auf diesem Server noch nicht eingerichtet (AI_API_KEY und AI_MODEL fehlen).', actions: [] };
  // simple per-user throttle against accidental loops / cost spikes
  const now = Date.now();
  if (now - (lastCall.get(user.id) ?? 0) < 1500) return { ok: false, reply: 'Einen Moment bitte – ich bin noch beim letzten Schritt.', actions: [] };
  lastCall.set(user.id, now);
  try {
    const r = await runAgent(user, text);
    if (r.actions.length) revalidatePath('/', 'layout');
    return { ok: true, reply: r.reply, actions: r.actions };
  } catch (e) {
    return { ok: false, reply: e instanceof Error ? e.message : 'Da ist etwas schiefgelaufen.', actions: [] };
  }
}

export async function clearChatAction(): Promise<ActionResult> {
  const user = await requireUser();
  await clearChat(user.id);
  revalidatePath('/ai');
  return { ok: true, message: 'Chat geleert. Dein Vault bleibt erhalten – CLOQI kennt dich weiterhin.' };
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
