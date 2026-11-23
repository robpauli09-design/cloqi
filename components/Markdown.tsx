import { Fragment } from 'react';

// Small, safe Markdown renderer for vault files: no HTML is ever injected,
// everything is rendered as React elements. Supports headings, lists, checkboxes,
// tables, bold/italic/code, [[wiki links]] and http(s) links.

function inline(text: string, onLink: (path: string) => void, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\[\[([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|_([^_]+)_|\*([^*\s][^*]*)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2]) {
      const target = m[2].split('|')[0].trim();
      const label = m[2].split('|')[1]?.trim() || target;
      out.push(<button key={k} type="button" onClick={() => onLink(target)} className="font-semibold text-leaf-dark underline decoration-leaf/40 underline-offset-2 hover:decoration-leaf">{label}</button>);
    } else if (m[3]) out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer" className="text-info underline">{m[3]}</a>);
    else if (m[5]) out.push(<strong key={k}>{m[5]}</strong>);
    else if (m[6]) out.push(<code key={k} className="rounded bg-paper px-1 py-0.5 text-[0.85em]">{m[6]}</code>);
    else if (m[7] || m[8]) out.push(<em key={k}>{m[7] ?? m[8]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** compact: for chat bubbles – headings become bold text, tighter spacing. */
export function Markdown({ text, onLink = () => {}, compact = false }: { text: string; onLink?: (path: string) => void; compact?: boolean }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = compact ? 'font-bold' : ['font-display text-2xl font-semibold', 'font-display text-xl font-semibold mt-4', 'text-base font-bold mt-3', 'text-sm font-bold mt-2'][level - 1];
      blocks.push(<p key={k} className={cls}>{inline(h[2], onLink, k)}</p>);
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const raw = lines[i].replace(/^\s*[-*]\s+/, '');
        const box = raw.match(/^\[( |x)\]\s+(.*)$/i);
        items.push(<li key={`l${i}`} className="flex gap-2">
          <span className="mt-0.5 shrink-0 text-leaf">{box ? (box[1].toLowerCase() === 'x' ? '☑' : '☐') : '•'}</span>
          <span>{inline(box ? box[2] : raw, onLink, `l${i}`)}</span>
        </li>);
        i++;
      }
      blocks.push(<ul key={k} className="space-y-1">{items}</ul>);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push(
        <div key={k} className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <tbody className="divide-y divide-line">
              {rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? 'font-semibold' : ''}>{r.map((c, ci) => <td key={ci} className="py-1.5 pr-3">{inline(c, onLink, `${k}-${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\|)/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={k} className="leading-relaxed">{para.map((p, pi) => <Fragment key={pi}>{pi > 0 && <br />}{inline(p, onLink, `${k}-${pi}`)}</Fragment>)}</p>);
  }
  return <div className={`${compact ? 'space-y-2' : 'space-y-3'} text-sm text-ink`}>{blocks}</div>;
}
