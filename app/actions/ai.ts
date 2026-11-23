'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { chatFor, type ChatReply } from '@/lib/ai';
import { clearChat, deleteVaultFile, getVaultFile, writeVaultFile } from '@/lib/repo';
import { normalizePath, readVaultFile, userCanDelete, userCanWrite } from '@/lib/vault';
import type { ActionResult } from '@/lib/validate';

/** Sends one message to CLOQI AI (tool-using agent). */
export async function chatWithCloqi(message: string): Promise<ChatReply> {
  const user = await requireUser();
  const r = await chatFor(user, message);
  if (r.actions.length) revalidatePath('/', 'layout');
  return r;
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
