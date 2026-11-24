import 'server-only';
// Microsoft Schule – Teams homework, OneNote and class files, READ-ONLY.
//
// Token-saving design:
//  • Homework becomes normal CLOQI tasks (with study blocks) – the AI already sees them in its task list, 0 extra tokens.
//  • OneNote: only a small index (title, notebook › section, date) is stored. Page text is fetched live when the AI
//    reads it, stripped to plain text and handed out in short parts.
//  • Files: searched live with Microsoft Search (name + snippet), nothing is stored.
//  • The AI only gets the two school tools when the connection exists (tool descriptions cost tokens too).
// Only *.Read permissions are requested (see SCHOOL_SCOPE) – Microsoft does not let CLOQI change anything.
import { db, newId } from './db';
import { accessToken, ExpiredError, GRAPH } from './integrations';
import { applyPlan, proposePlan } from './planning';
import { createTask, getConnection, markConnectionSync, setTaskStatus, upsertConnection } from './repo';
import type { User } from './types';

/** Homework/notes are re-checked when CLOQI is opened and the last check is older than this. */
export const SCHOOL_SYNC_EVERY_MS = 30 * 60000;
const PART = 2500;              // characters per read part
const MAX_TEAMS = 15;
const PAGES_PER_SOURCE = 80;

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function graph(user: User, path: string, init: { method?: string; body?: unknown; text?: boolean } = {}): Promise<J | string | null> {
  const token = await accessToken(user, 'school');
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    method: init.method ?? 'GET', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) throw new ExpiredError('Die Verbindung ist abgelaufen. Bitte neu verbinden.');
  if (res.status === 403 || res.status === 404) return null;   // not allowed by the school / not there → just skip
  if (!res.ok) throw new Error(`Microsoft antwortet mit Fehler ${res.status}.`);
  return init.text ? res.text() : res.json();
}

/** Follows @odata.nextLink up to `max` items. */
async function list(user: User, path: string, max: number): Promise<J[]> {
  const out: J[] = [];
  let next: string | null = path;
  while (next && out.length < max) {
    const page = await graph(user, next) as J | null;
    if (!page) break;
    out.push(...(page.value ?? []));
    next = page['@odata.nextLink'] ?? null;
  }
  return out.slice(0, max);
}

/** OneNote/Teams HTML → compact plain text (no images, no styling). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<img[^>]*>/gi, ' [Bild] ')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------- sync

interface SyncResult { homework: number; pages: number; newTasks: number }

export async function syncSchool(user: User): Promise<SyncResult> {
  const conn = await getConnection(user.id, 'school');
  if (!conn) throw new Error('Microsoft Schule ist nicht verbunden.');
  try {
    const q = await db();
    // class names: Teams the student is in (class id = team id)
    const teams = (await list(user, '/me/joinedTeams?$select=id,displayName', 100).catch(() => [])) as { id: string; displayName: string }[];
    const teamName = new Map(teams.map(t => [t.id, t.displayName]));

    // ---- homework (Teams assignments) ----
    let assignments = await list(user, '/education/me/assignments?$expand=submissions&$top=100', 300).catch(() => null);
    if (!assignments) assignments = await list(user, '/education/me/assignments?$top=100', 300).catch(() => []);
    const now = Date.now();
    let newTasks = 0;
    const seenA: string[] = [];
    for (const a of assignments) {
      if (!a.id || a.status === 'draft') continue;
      seenA.push(String(a.id));
      const cls = teamName.get(a.classId) ?? 'Teams';
      const sub = (a.submissions ?? [])[0];
      const handedIn = sub && ['submitted', 'returned'].includes(sub.status);
      const due = a.dueDateTime ? new Date(a.dueDateTime).toISOString() : null;
      const instructions = a.instructions?.content ? (a.instructions.contentType === 'html' ? htmlToText(a.instructions.content) : String(a.instructions.content)) : '';
      await q.run(`INSERT INTO school_items (id, user_id, kind, external_id, title, context, body, web_url, due_at, done, modified_at)
        VALUES (?, ?, 'assignment', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id, kind, external_id) DO UPDATE SET title = excluded.title, context = excluded.context, body = excluded.body,
          web_url = excluded.web_url, due_at = excluded.due_at, done = excluded.done, modified_at = excluded.modified_at`,
      [newId(), user.id, String(a.id), String(a.displayName ?? 'Hausübung').slice(0, 300), cls, instructions.slice(0, 4000), a.webUrl ?? null, due,
        Boolean(handedIn), a.lastModifiedDateTime ?? a.assignedDateTime ?? null]);

      // → CLOQI task (only future, not handed in) – planned like any homework
      const ext = `teams:${a.id}`;
      const existing = await q.get('SELECT id, status, due_at, title FROM tasks WHERE user_id = ? AND external_id = ?', [user.id, ext]);
      if (existing) {
        if (handedIn && existing.status === 'open') await setTaskStatus(user.id, String(existing.id), 'done');
        else if (due && new Date(String(existing.due_at)).toISOString() !== due) await q.run('UPDATE tasks SET due_at = ?, title = ? WHERE id = ?', [due, String(a.displayName ?? 'Hausübung').slice(0, 160), String(existing.id)]);
      } else if (due && !handedIn && Date.parse(due) > now) {
        const known = user.prefs.subjects.find(s => cls.toLowerCase().includes(s.name.toLowerCase()));
        const id = await createTask(user.id, {
          title: String(a.displayName ?? 'Hausübung').slice(0, 160), subject: known?.name ?? subjectFromClass(cls), kind: 'hausuebung', dueAt: due,
          estimatedMinutes: 45, difficulty: known?.difficulty ?? 2, priority: 2,
        });
        await q.run('UPDATE tasks SET external_id = ? WHERE id = ?', [ext, id]);
        await applyPlan(user, await proposePlan(user, { kind: 'task', taskId: id })).catch(() => undefined);
        newTasks++;
      }
    }
    if (seenA.length) await q.run(`DELETE FROM school_items WHERE user_id = ? AND kind = 'assignment' AND NOT (external_id = ANY(?::text[]))`, [user.id, `{${seenA.map(x => `"${x.replace(/"/g, '')}"`).join(',')}}`]);

    // ---- OneNote page index: own notebooks + class notebooks of each team ----
    const sel = '$select=id,title,lastModifiedDateTime,links&$expand=parentNotebook($select=displayName),parentSection($select=displayName)&$orderby=lastModifiedDateTime desc';
    const sources: { path: string; label?: string }[] = [{ path: 'me' }, ...teams.slice(0, MAX_TEAMS).map(t => ({ path: `groups/${t.id}`, label: t.displayName }))];
    const seenP: string[] = [];
    for (const s of sources) {
      const pages = await list(user, `/${s.path}/onenote/pages?$top=${PAGES_PER_SOURCE}&${sel}`, PAGES_PER_SOURCE).catch(() => []);
      for (const p of pages) {
        if (!p.id) continue;
        seenP.push(String(p.id));
        const where = [p.parentNotebook?.displayName ?? s.label, p.parentSection?.displayName].filter(Boolean).join(' › ');
        await q.run(`INSERT INTO school_items (id, user_id, kind, external_id, title, context, api_path, web_url, modified_at)
          VALUES (?, ?, 'page', ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, kind, external_id) DO UPDATE SET title = excluded.title, context = excluded.context, api_path = excluded.api_path,
            web_url = excluded.web_url, modified_at = excluded.modified_at`,
        [newId(), user.id, String(p.id), String(p.title || 'Ohne Titel').slice(0, 300), where.slice(0, 300), s.path, p.links?.oneNoteWebUrl?.href ?? null, p.lastModifiedDateTime ?? null]);
      }
    }
    if (seenP.length) await q.run(`DELETE FROM school_items WHERE user_id = ? AND kind = 'page' AND NOT (external_id = ANY(?::text[]))`, [user.id, `{${seenP.map(x => `"${x.replace(/"/g, '')}"`).join(',')}}`]);

    const homework = assignments.filter(a => a.status !== 'draft').length;
    await upsertConnection(user.id, 'school', { status: 'connected', config: { ...conn.config, account: conn.config.account } });
    await markConnectionSync(conn.id, null);
    return { homework, pages: seenP.length, newTasks };
  } catch (e) {
    const expired = e instanceof ExpiredError;
    if (expired) await upsertConnection(user.id, 'school', { status: 'expired' });
    else await markConnectionSync(conn.id, e instanceof Error ? e.message : 'Fehler');
    throw e;
  }
}

/** Disconnect: forget the index and remove imported homework that is still open (done ones stay as history). */
export async function forgetSchool(userId: string) {
  const q = await db();
  await q.run('DELETE FROM school_items WHERE user_id = ?', [userId]);
  await q.run("DELETE FROM tasks WHERE user_id = ? AND external_id LIKE 'teams:%' AND status = 'open'", [userId]);
}

export async function isSchoolTask(userId: string, taskId: string): Promise<boolean> {
  const r = await (await db()).get("SELECT 1 AS x FROM tasks WHERE user_id = ? AND id = ? AND external_id LIKE 'teams:%'", [userId, taskId]).catch(() => null);
  return Boolean(r);
}

export interface SchoolStats { openHomework: number; pages: number; notebooks: string[] }

/** For the connect card and the one-line AI hint. null = not connected. */
export async function schoolStats(user: User): Promise<SchoolStats | null> {
  const conn = await getConnection(user.id, 'school');
  if (!conn || conn.status === 'expired') return null;
  const q = await db();
  const hw = await q.get("SELECT count(*) AS n FROM school_items WHERE user_id = ? AND kind = 'assignment' AND NOT done AND (due_at IS NULL OR due_at > now())", [user.id]);
  const pg = await q.get("SELECT count(*) AS n FROM school_items WHERE user_id = ? AND kind = 'page'", [user.id]);
  const nb = await q.all("SELECT DISTINCT split_part(context, ' › ', 1) AS nb FROM school_items WHERE user_id = ? AND kind = 'page' AND context <> '' LIMIT 12", [user.id]);
  return { openHomework: Number(hw?.n ?? 0), pages: Number(pg?.n ?? 0), notebooks: nb.map(r => String(r.nb)).filter(Boolean) };
}

// ---------------------------------------------------------------- AI tools (read-only)

/** "3AK Mathematik" / "2025-26_3AK_Deutsch" → "Mathematik" / "Deutsch" (class codes and years removed). */
export function subjectFromClass(name: string): string {
  const s = name.replace(/[_|]+/g, ' ').replace(/\S*\d\S*/g, ' ').replace(/\s*[-–:]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return (s || name).slice(0, 60);
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2).slice(0, 8);

/** Finds notes, homework and files for a question. Compact: ids + titles + short snippets only. */
export async function searchSchool(user: User, query: string) {
  const ws = words(query);
  const q = await db();
  // score = how many query words appear in title/context/body (title counts double)
  const rows = ws.length ? await q.all(
    `SELECT kind, external_id, title, context, body, due_at, done, modified_at,
       (${ws.map(() => '(CASE WHEN lower(title) LIKE ? THEN 2 ELSE 0 END + CASE WHEN lower(context) LIKE ? THEN 1 ELSE 0 END + CASE WHEN lower(body) LIKE ? THEN 1 ELSE 0 END)').join(' + ')}) AS score
     FROM school_items WHERE user_id = ? ORDER BY score DESC, modified_at DESC NULLS LAST LIMIT 8`,
    [...ws.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`]), user.id]) : [];
  const hits = rows.filter(r => Number(r.score) > 0);
  const notes = hits.filter(r => r.kind === 'page').slice(0, 5).map(r => ({
    id: `p:${r.external_id}`, title: r.title, where: r.context, changed: r.modified_at ? String(r.modified_at).slice(0, 10) : null,
  }));
  const homework = hits.filter(r => r.kind === 'assignment').slice(0, 4).map(r => ({
    id: `a:${r.external_id}`, title: r.title, class: r.context, due: r.due_at ? new Date(String(r.due_at)).toISOString().slice(0, 10) : null,
    handed_in: Boolean(r.done), snippet: String(r.body).slice(0, 200),
  }));
  // class files (Word, PDF, PowerPoint …) – live Microsoft Search, nothing stored
  let files: { name: string; where: string; snippet: string; url: string | null }[] = [];
  const s = await graph(user, '/search/query', {
    method: 'POST',
    body: { requests: [{ entityTypes: ['driveItem'], query: { queryString: query.slice(0, 120) }, from: 0, size: 5, fields: ['name', 'webUrl', 'parentReference', 'lastModifiedDateTime'] }] },
  }).catch(() => null) as J | null;
  const fileHits: J[] = s?.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
  files = fileHits.map(h => ({
    name: String(h.resource?.name ?? ''), where: String(h.resource?.parentReference?.siteId ? 'Teams/SharePoint' : 'OneDrive'),
    snippet: htmlToText(String(h.summary ?? '')).replace(/<\/?c0>/g, '').slice(0, 220), url: h.resource?.webUrl ?? null,
  }));
  return { notes, homework, files, hint: notes.length ? 'Mit schule_lesen(id) einen Treffer lesen (in Teilen).' : 'Nichts Passendes im Index – andere Suchbegriffe probieren.' };
}

/** Reads one note page (in parts of ~2,500 characters) or one homework. */
export async function readSchool(user: User, id: string, part = 1) {
  const q = await db();
  if (id.startsWith('a:')) {
    const r = await q.get("SELECT * FROM school_items WHERE user_id = ? AND kind = 'assignment' AND external_id = ?", [user.id, id.slice(2)]);
    if (!r) throw new Error('Diese Hausübung kenne ich nicht.');
    return { title: r.title, class: r.context, due: r.due_at, handed_in: Boolean(r.done), instructions: String(r.body) || '(keine Angabe)', open_in_teams: r.web_url };
  }
  if (!id.startsWith('p:')) throw new Error('Unbekannte id – nimm eine id aus schule_suchen.');
  const r = await q.get("SELECT * FROM school_items WHERE user_id = ? AND kind = 'page' AND external_id = ?", [user.id, id.slice(2)]);
  if (!r) throw new Error('Diese Seite kenne ich nicht (mehr).');
  const html = await graph(user, `/${r.api_path}/onenote/pages/${encodeURIComponent(String(r.external_id))}/content`, { text: true });
  if (typeof html !== 'string') throw new Error('Diese Seite kann ich gerade nicht öffnen.');
  const text = htmlToText(html);
  const parts = Math.max(1, Math.ceil(text.length / PART));
  const n = Math.min(Math.max(1, Math.floor(part) || 1), parts);
  return {
    title: r.title, where: r.context, part: n, parts,
    text: text.slice((n - 1) * PART, n * PART) || '(leere Seite)',
    note: text.includes('[Bild]') ? 'Bilder/Handschrift kann ich nicht lesen.' : undefined,
  };
}
