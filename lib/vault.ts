import 'server-only';
import { dayRange, getCalendarItems } from './calendar';
import { getVaultFile, listAiActions, listTasks, listVaultFiles, writeVaultFile, type VaultFile } from './repo';
import { addDays, formatDateDe, todayIn, utcToZoned } from './time';
import { CATEGORY_META, TASK_KIND_LABELS, type User } from './types';

// The personal knowledge vault – modelled on an Obsidian vault:
//
//   CLOQI.md        rules for the AI: who may change what, wiki structure, backup   (system, read-only)
//   user.md         who the user is: goals, school, training, habits                 (user + AI)
//   soul.md         how CLOQI should work: tone, daily rhythm, study method          (user; AI reads)
//   Wochenplan.md   tests + study plan day by day                                     (generated, read-only)
//   raw-sources/    the user's own material                                           (user; AI reads only)
//   wiki/           the AI's knowledge base about the user                            (AI; user reads/deletes)
//     index.md      table of contents (AI keeps it current)
//     log.md        change log (generated from ai_actions – the AI cannot rewrite it)

export const GENERATED = new Set(['Wochenplan.md', 'wiki/log.md']);

export function normalizePath(raw: string): string {
  const p = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  const withExt = /\.md$/i.test(p) ? p : `${p}.md`;
  if (!/^[A-Za-z0-9ÄÖÜäöüß _.\-/]+\.md$/.test(withExt) || withExt.includes('..') || withExt.length > 160) {
    throw new Error('Ungültiger Dateiname. Erlaubt sind Buchstaben, Zahlen, Leerzeichen, - _ . und / (Endung .md).');
  }
  return withExt;
}

export function aiCanWrite(path: string): boolean {
  if (GENERATED.has(path)) return false;
  return path === 'user.md' || path.startsWith('wiki/');
}

export function userCanWrite(path: string): boolean {
  if (GENERATED.has(path) || path === 'CLOQI.md' || path.startsWith('wiki/')) return false;
  return true;
}

export function userCanDelete(path: string): boolean {
  if (GENERATED.has(path) || ['CLOQI.md', 'user.md', 'soul.md', 'wiki/index.md'].includes(path)) return false;
  return true;
}

const RULES = `# CLOQI – Regeln

Dieser Vault ist dein persönliches Gedächtnis von CLOQI. Er hilft CLOQI, dich bei jedem Gespräch zu kennen.

## Wer darf was?
| Datei / Ordner | Du | CLOQI AI |
|---|---|---|
| CLOQI.md | lesen | lesen |
| user.md | lesen & schreiben | lesen & ergänzen |
| soul.md | lesen & schreiben | lesen |
| Wochenplan.md | lesen (automatisch) | lesen (automatisch) |
| raw-sources/ | lesen, schreiben, löschen | nur lesen |
| wiki/ | lesen & löschen | lesen & schreiben |
| wiki/log.md | lesen (automatisch) | – (kann es nicht ändern) |
| eigene Notizen | lesen, schreiben, löschen | lesen |

## So arbeitet CLOQI mit dem Wiki
- Neue, dauerhafte Infos über dich landen in **user.md** (kurz, als Stichpunkte).
- Ausführlicheres Wissen kommt in **wiki/** – eine Datei pro Thema, z. B. \`wiki/faecher/Mathematik.md\`, \`wiki/training.md\`.
- **wiki/index.md** listet alle Wiki-Seiten mit einer Zeile Beschreibung.
- Verknüpfungen schreibt CLOQI als [[Wiki-Links]].
- Gesundheit, Religion, Herkunft und ähnlich sensible Themen speichert CLOQI nur, wenn du es ausdrücklich willst.
- Jede Änderung durch CLOQI steht in **wiki/log.md**.

## Backup
Alles liegt verschlüsselt übertragen in einer Datenbank in der EU. Unter Profil → „Meine Daten exportieren“ bekommst du jederzeit eine vollständige Kopie.
`;

function userTemplate(user: User): string {
  return `# Über mich

- Name: ${user.name || '–'}
- Ich bin: ${user.userType ?? '–'}
${user.lifeAreas.length ? `- Mein Alltag: ${user.lifeAreas.join(', ')}\n` : ''}
## Ziele

## Schule / Uni / Arbeit

## Training & Hobbys

## Gewohnheiten
- Lernzeiten: Mo–Fr ${user.prefs.studyStart}–${user.prefs.studyEnd}, Wochenende ${user.prefs.weekendStart}–${user.prefs.weekendEnd}

## Wichtig zu wissen
`;
}

const SOUL = `# Wie CLOQI für mich arbeiten soll

## Ton
- freundlich, kurz, auf Deutsch, per Du

## Mein Tagesablauf

## Wie ich am besten lerne
- z. B. lieber mehrere kurze Blöcke als ein langer

## Was CLOQI nie tun soll
`;

export async function ensureVault(user: User) {
  const existing = new Set((await listVaultFiles(user.id)).map(f => f.path));
  const defaults: [string, string][] = [
    ['CLOQI.md', RULES],
    ['user.md', userTemplate(user)],
    ['soul.md', SOUL],
    ['raw-sources/README.md', '# Rohmaterial\n\nLeg hier Mitschriften, Stofflisten oder Notizen ab. CLOQI liest sie, ändert sie aber nie.\n'],
    ['wiki/index.md', '# Wiki-Index\n\nHier listet CLOQI alle Wiki-Seiten auf.\n'],
  ];
  for (const [path, content] of defaults) {
    if (!existing.has(path)) await writeVaultFile(user.id, path, content, 'system');
  }
}

export async function generatedFile(user: User, path: string): Promise<string | null> {
  if (path === 'wiki/log.md') {
    const actions = await listAiActions(user.id, 200);
    if (!actions.length) return '# Änderungsprotokoll\n\nCLOQI hat noch nichts verändert.\n';
    const lines = actions.map(a => {
      const z = utcToZoned(a.createdAt, user.timezone);
      return `- ${formatDateDe(z.date)} ${z.time} · **${a.tool}** – ${a.summary}`;
    });
    return `# Änderungsprotokoll\n\nAlles, was CLOQI AI in deinem Kalender und Vault verändert hat (neueste zuerst).\n\n${lines.join('\n')}\n`;
  }
  if (path === 'Wochenplan.md') {
    const tz = user.timezone;
    const today = todayIn(tz);
    const out = ['# Wochenplan', '', `Automatisch erstellt am ${formatDateDe(today, { weekday: true })}.`, ''];
    const tasks = (await listTasks(user.id, { openOnly: true })).filter(t => t.dueAt > new Date().toISOString()).slice(0, 10);
    out.push('## Anstehende Tests & Aufgaben', '');
    out.push(...(tasks.length ? tasks.map(t => `- ${formatDateDe(utcToZoned(t.dueAt, tz).date, { weekday: true })}: ${TASK_KIND_LABELS[t.kind]} ${t.subject}`) : ['- keine']));
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      const { from, to } = dayRange(d, tz);
      const items = (await getCalendarItems(user, from, to)).filter(x => x.status !== 'missed');
      out.push('', `## ${formatDateDe(d, { weekday: true })}`, '');
      out.push(...(items.length ? items.map(x => {
        const time = x.allDay ? 'ganztägig' : `${utcToZoned(x.startAt, tz).time}–${utcToZoned(x.endAt, tz).time}`;
        const mark = x.status === 'done' ? ' ✓' : x.status === 'cancelled' ? ' (entfällt)' : '';
        return `- ${time} ${x.title}${mark} _(${CATEGORY_META[x.category].label})_`;
      }) : ['- frei']));
    }
    return out.join('\n') + '\n';
  }
  return null;
}

export interface VaultEntry extends VaultFile { generated: boolean; userWritable: boolean; userDeletable: boolean }

export async function readVault(user: User): Promise<VaultEntry[]> {
  await ensureVault(user);
  const files = await listVaultFiles(user.id);
  const now = new Date().toISOString();
  const all: VaultFile[] = [
    ...files,
    { path: 'Wochenplan.md', content: '', updatedBy: 'system', updatedAt: now },
    { path: 'wiki/log.md', content: '', updatedBy: 'system', updatedAt: now },
  ];
  return all
    .map(f => ({ ...f, generated: GENERATED.has(f.path), userWritable: userCanWrite(f.path), userDeletable: userCanDelete(f.path) }))
    .sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path));
}

function order(p: string): number {
  const top = ['CLOQI.md', 'user.md', 'soul.md', 'Wochenplan.md'];
  if (top.includes(p)) return top.indexOf(p);
  if (p.startsWith('raw-sources/')) return 10;
  if (p.startsWith('wiki/')) return 20;
  return 5;
}

export async function readVaultFile(user: User, path: string): Promise<string | null> {
  const gen = await generatedFile(user, path);
  if (gen !== null) return gen;
  return (await getVaultFile(user.id, path))?.content ?? null;
}
