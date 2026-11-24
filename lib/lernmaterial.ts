import 'server-only';
import { getVaultFile, listVaultFiles, writeVaultFile } from './repo';
import { ARTEN, materialInfo, safeName, type Art } from './lernmaterial-meta';
import { formatDateDe, todayIn } from './time';
import type { User } from './types';

const HUB_SECTION = '## Lernunterlagen (automatisch)';

/**
 * Saves a learning material as wiki/<Fach>/<Titel>.md (organised per subject).
 * Only creates new files or updates an existing CLOQI material – never overwrites other notes.
 * Links are made by the server, not left to the AI: every material links to its subject page
 * wiki/<Fach>.md, and that page lists all materials of the subject → the graph grows by itself.
 */
export async function saveMaterial(user: User, input: { fach: string; titel: string; art: Art; inhalt: string }): Promise<{ path: string; updated: boolean }> {
  const art = ARTEN[input.art] ? input.art : 'lernzettel';
  const fach = safeName(input.fach || 'Allgemein', 40);
  const titel = safeName(input.titel || ARTEN[art].label, 70);
  const path = `wiki/${fach}/${titel}.md`;
  const body = input.inhalt.trim().replace(/^> \*\*.+?\*\* · .+?\n+/, '').replace(/\n+---\nFach: \[\[.*$/s, '').slice(0, 40000);
  if (body.length < 20) throw new Error('Der Inhalt ist zu kurz.');
  const existing = await getVaultFile(user.id, path);
  if (existing && !materialInfo(existing.content)) throw new Error(`Unter ${path} liegt schon eine andere Notiz – nimm einen anderen Titel.`);
  const header = `> **${ARTEN[art].label}** · ${fach} · ${formatDateDe(todayIn(user.timezone), { year: true })}`;
  const title = /^#\s/.test(body) ? '' : `# ${input.titel.trim().slice(0, 120)}\n\n`;
  await writeVaultFile(user.id, path, `${header}\n\n${title}${body}\n\n---\nFach: [[wiki/${fach}.md|${fach}]]\n`, 'ai');
  await updateSubjectPage(user, fach);
  return { path, updated: Boolean(existing) };
}

/** wiki/<Fach>.md: created if missing; its "Lernunterlagen (automatisch)" section always lists every material of the subject. */
export async function updateSubjectPage(user: User, fach: string) {
  const hubPath = `wiki/${fach}.md`;
  const all = await listVaultFiles(user.id);
  const materials = all
    .filter(f => f.path.startsWith(`wiki/${fach}/`) && materialInfo(f.content))
    .map(f => ({ path: f.path, name: f.path.split('/').pop()!.replace(/\.md$/, ''), art: ARTEN[materialInfo(f.content)!.art].label }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const list = `${HUB_SECTION}\n${materials.map(m => `- [[${m.path}|${m.name}]] · ${m.art}`).join('\n') || '- noch keine'}\n`;
  const hub = all.find(f => f.path === hubPath);
  let content: string;
  if (!hub) {
    content = `# ${fach}\n\nAlles zu ${fach} an einem Ort – CLOQI verlinkt hier jede neue Lernunterlage.\n\n${list}`;
  } else {
    const at = hub.content.indexOf(HUB_SECTION);
    if (at < 0) content = `${hub.content.trimEnd()}\n\n${list}`;
    else {
      const next = hub.content.indexOf('\n## ', at + HUB_SECTION.length);
      content = `${hub.content.slice(0, at)}${list}${next >= 0 ? hub.content.slice(next) : ''}`;
    }
  }
  if (content !== hub?.content) await writeVaultFile(user.id, hubPath, content, 'ai');
}
