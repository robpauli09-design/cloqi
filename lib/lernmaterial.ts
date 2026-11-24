import 'server-only';
import { getVaultFile, writeVaultFile } from './repo';
import { ARTEN, materialInfo, safeName, type Art } from './lernmaterial-meta';
import { formatDateDe, todayIn } from './time';
import type { User } from './types';

/**
 * Saves a learning material as wiki/<Fach>/<Titel>.md (organised per subject).
 * Only creates new files or updates an existing CLOQI material – never overwrites other notes.
 */
export async function saveMaterial(user: User, input: { fach: string; titel: string; art: Art; inhalt: string }): Promise<{ path: string; updated: boolean }> {
  const art = ARTEN[input.art] ? input.art : 'lernzettel';
  const fach = safeName(input.fach || 'Allgemein', 40);
  const titel = safeName(input.titel || ARTEN[art].label, 70);
  const path = `wiki/${fach}/${titel}.md`;
  const body = input.inhalt.trim().replace(/^> \*\*.+?\*\* · .+?\n+/, '').slice(0, 40000);
  if (body.length < 20) throw new Error('Der Inhalt ist zu kurz.');
  const existing = await getVaultFile(user.id, path);
  if (existing && !materialInfo(existing.content)) throw new Error(`Unter ${path} liegt schon eine andere Notiz – nimm einen anderen Titel.`);
  const header = `> **${ARTEN[art].label}** · ${fach} · ${formatDateDe(todayIn(user.timezone), { year: true })}`;
  const title = /^#\s/.test(body) ? '' : `# ${input.titel.trim().slice(0, 120)}\n\n`;
  await writeVaultFile(user.id, path, `${header}\n\n${title}${body}\n`, 'ai');
  return { path, updated: Boolean(existing) };
}
