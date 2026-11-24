// Vault helpers without server-only imports (unit-tested): [[wiki links]], backlinks/graph edges and a
// German-aware search ("Bruch" finds "Brüche", "Bruchrechnung"; "Prüfung" finds "pruefung").

/** All [[targets]] in a note ([[Ziel]], [[Ziel|Anzeige]], [[ordner/Ziel.md]]). */
export function extractLinks(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}

/** Resolves a link target to an existing path: exact path, path + .md, or the file name anywhere (like Obsidian). */
export function resolveLink(target: string, paths: string[]): string | null {
  const t = target.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  const withMd = t.endsWith('.md') ? t : `${t}.md`;
  const lower = paths.map(p => p.toLowerCase());
  let i = lower.indexOf(withMd);
  if (i >= 0) return paths[i];
  const name = withMd.split('/').pop()!;
  i = lower.findIndex(p => p.split('/').pop() === name);
  return i >= 0 ? paths[i] : null;
}

export interface Edge { from: string; to: string }

/** Every resolved link between notes (no self links, no duplicates). */
export function linkEdges(files: { path: string; content: string }[]): Edge[] {
  const paths = files.map(f => f.path);
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const f of files) for (const target of extractLinks(f.content)) {
    const to = resolveLink(target, paths);
    const key = `${f.path}→${to}`;
    if (to && to !== f.path && !seen.has(key)) { seen.add(key); edges.push({ from: f.path, to }); }
  }
  return edges;
}

// ---------------------------------------------------------------- search

/** lower case, umlauts folded (ä→a, ß→ss), accents removed. */
export function fold(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Light German stemmer: removes common plural/inflection endings (Brüche → bruch, Prüfungen → prufung). */
export function stem(word: string): string {
  let w = fold(word);
  if (w.length <= 4) return w;
  for (const end of ['ungen', 'heiten', 'keiten', 'ern', 'en', 'er', 'es', 'em', 'e', 'n', 's']) {
    if (w.endsWith(end) && w.length - end.length >= 4) {
      w = end === 'ungen' ? `${w.slice(0, -end.length)}ung` : w.slice(0, -end.length);
      break;
    }
  }
  return w;
}

const STOP = new Set(['der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'ist', 'mit', 'fur', 'von', 'zu', 'im', 'in', 'am', 'an', 'auf', 'den', 'dem', 'des', 'wie', 'was', 'ich', 'mein', 'meine']);
export const queryStems = (q: string) => [...new Set(fold(q).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).map(stem))].slice(0, 8);

/**
 * Relevance of a note for the query: every query stem found as the beginning of a word (so "bruch" matches
 * "bruchrechnung") counts; title/path hits count triple; all stems present gives a bonus.
 */
export function scoreNote(stems: string[], path: string, content: string): number {
  if (!stems.length) return 0;
  const words = fold(content).split(/[^a-z0-9]+/);
  const title = fold(path.split('/').pop()!.replace(/\.md$/, '')).split(/[^a-z0-9]+/);
  let score = 0, found = 0;
  for (const s of stems) {
    const inTitle = title.some(w => w.startsWith(s) || stem(w) === s);
    const n = words.filter(w => w.startsWith(s) || stem(w) === s).length;
    if (inTitle || n) found++;
    score += (inTitle ? 6 : 0) + Math.min(n, 5);
  }
  return found === stems.length ? score + 5 : found ? score : 0;
}

/** Short excerpt around the first hit. */
export function excerptFor(stems: string[], content: string, len = 200): string {
  const plainText = content.replace(/\s+/g, ' ');
  const f = fold(plainText);
  let at = -1;
  for (const s of stems) { const m = f.match(new RegExp(`\\b${s}`)); if (m?.index !== undefined && (at < 0 || m.index < at)) at = m.index; }
  if (at < 0) return plainText.slice(0, len);
  const start = Math.max(0, at - 60);
  return `${start ? '…' : ''}${plainText.slice(start, start + len).trim()}${start + len < plainText.length ? '…' : ''}`;
}
