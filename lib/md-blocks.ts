// Tiny Markdown → blocks parser for the exports (the Markdown CLOQI writes: headings, paragraphs,
// lists incl. nesting and "- [ ]" checkboxes, tables, quotes, rules, **bold** and *italic*).

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'list'; ordered: boolean; items: { text: string; level: number; check?: boolean }[] }
  | { t: 'table'; rows: string[][] }
  | { t: 'quote'; text: string }
  | { t: 'hr' };

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[\[([^\]]+)\]\])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    if (m[2]) out.push({ text: m[2], bold: true });
    else if (m[3]) out.push({ text: m[3], italic: true });
    else if (m[4]) out.push({ text: m[4].split('/').pop()!.replace(/\.md$/, '') });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
export const plain = (text: string) => inline(text).map(i => i.text).join('');

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', text: para.join(' ').trim() }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); continue; }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { flush(); blocks.push({ t: 'h', level: m[1].length, text: m[2].trim() }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if (t.startsWith('>')) { flush(); blocks.push({ t: 'quote', text: t.replace(/^>\s?/, '') }); continue; }
    if (t.startsWith('|')) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      if (rows.length) blocks.push({ t: 'table', rows });
      continue;
    }
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: { text: string; level: number; check?: boolean }[] = [];
      while (i < lines.length) {
        const x = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!x) break;
        const level = Math.min(3, Math.floor(x[1].replace(/\t/g, '  ').length / 2));
        const box = x[3].match(/^\[( |x|X)\]\s+(.*)$/);
        items.push(box ? { text: box[2], level, check: box[1] !== ' ' } : { text: x[3], level });
        i++;
      }
      i--;
      blocks.push({ t: 'list', ordered, items });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}
