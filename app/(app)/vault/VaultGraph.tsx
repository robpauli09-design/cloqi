'use client';

import { useMemo, useState } from 'react';
import type { Edge } from '@/lib/vault-links';

const FOLDER_COLOR: Record<string, string> = { '': '#286B24', wiki: '#7CC51B', 'raw-sources': '#F08C2E' };
const colorOf = (path: string) => {
  const top = path.includes('/') ? path.split('/')[0] : '';
  const sub = path.split('/').length > 2;
  return sub ? '#1FA59A' : FOLDER_COLOR[top] ?? '#5B6472';
};

/**
 * Obsidian-like graph: every note is a dot, every [[link]] a line. Layout: a small force simulation
 * (links pull together, all dots push apart), computed once – deterministic, no library.
 */
export function VaultGraph({ paths, edges, current, onOpen }: { paths: string[]; edges: Edge[]; current: string; onOpen(path: string): void }) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 720, H = 460;
  const layout = useMemo(() => {
    const n = paths.length;
    const idx = new Map(paths.map((p, i) => [p, i]));
    const pos = paths.map((_, i) => ({ x: W / 2 + Math.cos((i / Math.max(1, n)) * Math.PI * 2) * 160, y: H / 2 + Math.sin((i / Math.max(1, n)) * Math.PI * 2) * 140, vx: 0, vy: 0 }));
    const links = edges.map(e => [idx.get(e.from)!, idx.get(e.to)!] as const).filter(([a, b]) => a !== undefined && b !== undefined);
    for (let it = 0; it < 300; it++) {
      const k = 1 - it / 300;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
        const d2 = Math.max(dx * dx + dy * dy, 30);
        const f = (2400 / d2) * k;
        const d = Math.sqrt(d2);
        pos[i].vx -= (dx / d) * f; pos[i].vy -= (dy / d) * f; pos[j].vx += (dx / d) * f; pos[j].vy += (dy / d) * f;
      }
      for (const [a, b] of links) {
        const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - 90) * 0.02 * k;
        pos[a].vx += (dx / d) * f; pos[a].vy += (dy / d) * f; pos[b].vx -= (dx / d) * f; pos[b].vy -= (dy / d) * f;
      }
      for (const p of pos) {
        p.vx += (W / 2 - p.x) * 0.004; p.vy += (H / 2 - p.y) * 0.004; // gentle pull to the centre
        p.x = Math.min(W - 30, Math.max(30, p.x + p.vx * 0.5)); p.y = Math.min(H - 20, Math.max(20, p.y + p.vy * 0.5));
        p.vx *= 0.6; p.vy *= 0.6;
      }
    }
    // fit the result to the whole canvas (keeps small vaults from huddling in the middle)
    const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sx = (W - 140) / Math.max(1, x1 - x0), sy = (H - 90) / Math.max(1, y1 - y0);
    const sc = Math.min(sx, sy, 2.5);
    for (const p of pos) { p.x = W / 2 + (p.x - (x0 + x1) / 2) * sc; p.y = H / 2 + (p.y - (y0 + y1) / 2) * sc - 6; }
    const degree = paths.map((_, i) => links.filter(([a, b]) => a === i || b === i).length);
    return { pos, links, degree };
  }, [paths, edges]);

  const near = (p: string) => p === (hover ?? current) || edges.some(e => (e.from === (hover ?? current) && e.to === p) || (e.to === (hover ?? current) && e.from === p));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper/60">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Verbindungen zwischen deinen Notizen">
        {layout.links.map(([a, b], i) => {
          const on = near(paths[a]) && near(paths[b]) && (paths[a] === (hover ?? current) || paths[b] === (hover ?? current));
          return <line key={i} x1={layout.pos[a].x} y1={layout.pos[a].y} x2={layout.pos[b].x} y2={layout.pos[b].y} stroke={on ? '#7CC51B' : '#D8D6CC'} strokeWidth={on ? 2 : 1} />;
        })}
        {paths.map((p, i) => {
          const r = 5 + Math.min(8, layout.degree[i] * 1.5);
          const active = p === current;
          const dim = (hover || current) && !near(p);
          return (
            <g key={p} transform={`translate(${layout.pos[i].x},${layout.pos[i].y})`} className="cursor-pointer" opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onOpen(p)}
              role="button" tabIndex={0} aria-label={p} onKeyDown={e => { if (e.key === 'Enter') onOpen(p); }}>
              <circle r={r} fill={colorOf(p)} stroke={active ? '#19451F' : 'white'} strokeWidth={active ? 3 : 1.5} />
              <text y={r + 12} textAnchor="middle" fontSize={11} fill="#191A17" fontWeight={active ? 700 : 500}>{p.split('/').pop()!.replace(/\.md$/, '').slice(0, 22)}</text>
            </g>
          );
        })}
      </svg>
      <p className="flex flex-wrap gap-3 border-t border-line px-3 py-2 text-[11px] text-ink-soft">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#286B24]" />Grundlagen</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#7CC51B]" />wiki</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#1FA59A]" />Lernunterlagen</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#F08C2E]" />dein Material</span>
        <span className="ml-auto">Größe = Anzahl Verbindungen · Klick öffnet die Notiz</span>
      </p>
    </div>
  );
}
