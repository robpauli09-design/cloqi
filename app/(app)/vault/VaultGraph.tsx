'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { Edge } from '@/lib/vault-links';

const FOLDER_COLOR: Record<string, string> = { '': '#286B24', wiki: '#7CC51B', 'raw-sources': '#F08C2E' };
const colorOf = (path: string) => (path.split('/').length > 2 ? '#1FA59A' : FOLDER_COLOR[path.includes('/') ? path.split('/')[0] : ''] ?? '#5B6472');
const label = (p: string) => p.split('/').pop()!.replace(/\.md$/, '').slice(0, 24);

interface Node { x: number; y: number; vx: number; vy: number; fixed: boolean }

/**
 * Obsidian-like graph: a live force simulation (links pull, dots push apart, a soft pull to the middle).
 * Drag a dot and the others follow · drag the empty area to pan · wheel / pinch / buttons to zoom · click opens.
 */
export function VaultGraph({ paths, edges, current, onOpen }: { paths: string[]; edges: Edge[]; current: string; onOpen(path: string): void }) {
  const W = 760, H = 500;
  const svg = useRef<SVGSVGElement>(null);
  const nodes = useRef<Node[]>([]);
  const heat = useRef(1);                       // simulation "temperature" – cools down, reheats on drag
  const fitted = useRef(false);
  const [, setTick] = useState(0);              // re-render while the simulation moves
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ kind: 'node'; i: number; moved: boolean } | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number } | null>(null);

  const links = useMemo(() => {
    const idx = new Map(paths.map((p, i) => [p, i]));
    return edges.map(e => [idx.get(e.from), idx.get(e.to)] as const).filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);
  }, [paths, edges]);
  const degree = useMemo(() => paths.map((_, i) => links.filter(([a, b]) => a === i || b === i).length), [paths, links]);

  // (re)start the simulation when the notes change; keep positions of notes that already exist
  useEffect(() => {
    const old = new Map(nodes.current.map((n, i) => [paths[i], n]));
    nodes.current = paths.map((p, i) => old.get(p) ?? {
      x: W / 2 + Math.cos(i * 2.4) * (60 + i * 9), y: H / 2 + Math.sin(i * 2.4) * (50 + i * 7), vx: 0, vy: 0, fixed: false,
    });
    heat.current = 1;
    let raf = 0;
    const step = () => {
      const ns = nodes.current, n = ns.length, t = heat.current;
      if (t > 0.02) {
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y;
          const d2 = Math.max(dx * dx + dy * dy, 40), d = Math.sqrt(d2), f = 2600 / d2;
          ns[i].vx -= (dx / d) * f; ns[i].vy -= (dy / d) * f; ns[j].vx += (dx / d) * f; ns[j].vy += (dy / d) * f;
        }
        for (const [a, b] of links) {
          const dx = ns[b].x - ns[a].x, dy = ns[b].y - ns[a].y, d = Math.max(1, Math.hypot(dx, dy)), f = (d - 100) * 0.03;
          ns[a].vx += (dx / d) * f; ns[a].vy += (dy / d) * f; ns[b].vx -= (dx / d) * f; ns[b].vy -= (dy / d) * f;
        }
        for (const p of ns) {
          p.vx += (W / 2 - p.x) * 0.006; p.vy += (H / 2 - p.y) * 0.006;
          if (!p.fixed) { p.x += p.vx * 0.45 * t; p.y += p.vy * 0.45 * t; }
          p.vx *= 0.55; p.vy *= 0.55;
        }
        heat.current = Math.max(0, t * 0.985);
        // once the layout has settled the first time: zoom/pan so it fills the canvas
        if (!fitted.current && heat.current < 0.12 && ns.length) {
          fitted.current = true;
          const xs = ns.map(p => p.x), ys = ns.map(p => p.y);
          const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
          const k = Math.min(1.6, Math.max(0.5, Math.min((W - 120) / Math.max(1, x1 - x0), (H - 90) / Math.max(1, y1 - y0))));
          setView({ k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k - 6 });
        }
        setTick(x => x + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paths, links]);

  /** screen point → graph coordinates */
  const toGraph = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    const sx = ((cx - r.left) / r.width) * W, sy = ((cy - r.top) / r.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };
  const zoomBy = (f: number, cx = W / 2, cy = H / 2) => setView(v => {
    const k = Math.min(3, Math.max(0.4, v.k * f));
    return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
  });
  // wheel zoom must not scroll the page → native listener with passive: false
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'node') {
      const p = toGraph(e.clientX, e.clientY);
      const n = nodes.current[d.i];
      if (Math.hypot(n.x - p.x, n.y - p.y) > 2) d.moved = true;
      n.x = p.x; n.y = p.y; n.fixed = true;
      heat.current = Math.max(heat.current, 0.6); // the others react while you drag
    } else {
      const r = svg.current!.getBoundingClientRect();
      setView(v => ({ ...v, x: d.vx + ((e.clientX - d.sx) / r.width) * W, y: d.vy + ((e.clientY - d.sy) / r.height) * H }));
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'node') {
      nodes.current[d.i].fixed = false;
      if (!d.moved) onOpen(paths[d.i]); // a click (no drag) opens the note
    }
  };
  const focus = hover; // highlight neighbours while hovering (like Obsidian); the open note keeps its ring
  const near = (p: string) => p === focus || edges.some(e => (e.from === focus && e.to === p) || (e.to === focus && e.from === p));
  const ns = nodes.current;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-paper/60">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img" aria-label="Verbindungen zwischen deinen Notizen"
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onPointerDown={e => { if (e.target === svg.current || (e.target as Element).tagName === 'rect') drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; }}>
        <rect width={W} height={H} fill="transparent" className="cursor-grab active:cursor-grabbing" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {ns.length === paths.length && links.map(([a, b], i) => {
            const on = paths[a] === focus || paths[b] === focus;
            return <line key={i} x1={ns[a].x} y1={ns[a].y} x2={ns[b].x} y2={ns[b].y} stroke={on ? '#7CC51B' : '#D8D6CC'} strokeWidth={(on ? 2.2 : 1.1) / Math.sqrt(view.k)} />;
          })}
          {ns.length === paths.length && paths.map((p, i) => {
            // dots and labels keep their screen size while zooming (like Obsidian)
            const r = (5 + Math.min(9, degree[i] * 1.6)) / Math.sqrt(view.k);
            const active = p === current;
            return (
              <g key={p} transform={`translate(${ns[i].x},${ns[i].y})`} className="cursor-pointer outline-none [&:focus-visible>circle:nth-child(2)]:stroke-leaf" opacity={near(p) || !focus ? 1 : 0.35}
                onPointerDown={e => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { kind: 'node', i, moved: false }; }}
                onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}
                role="button" tabIndex={0} aria-label={`${label(p)} öffnen`} onKeyDown={e => { if (e.key === 'Enter') onOpen(p); }}>
                <circle r={r + 6} fill="transparent" />
                <circle r={r} fill={colorOf(p)} stroke={active ? '#19451F' : 'white'} strokeWidth={(active ? 3 : 1.5) / view.k} />
                <text y={r + 13 / view.k} textAnchor="middle" fontSize={11 / view.k} fill="#191A17" fontWeight={active ? 700 : 500} className="pointer-events-none">{label(p)}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <button className="grid h-8 w-8 place-items-center hover:bg-paper" aria-label="Vergrößern" onClick={() => zoomBy(1.25)}><Plus size={15} /></button>
        <button className="grid h-8 w-8 place-items-center border-y border-line hover:bg-paper" aria-label="Verkleinern" onClick={() => zoomBy(0.8)}><Minus size={15} /></button>
        <button className="grid h-8 w-8 place-items-center hover:bg-paper" aria-label="Ansicht zurücksetzen" onClick={() => { fitted.current = false; heat.current = 0.3; }}><Maximize2 size={14} /></button>
      </div>
      <p className="flex flex-wrap gap-3 border-t border-line px-3 py-2 text-[11px] text-ink-soft">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#286B24]" />Grundlagen</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#7CC51B]" />wiki</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#1FA59A]" />Lernunterlagen</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#F08C2E]" />dein Material</span>
        <span className="ml-auto">Punkte ziehen · Fläche verschieben · Mausrad zoomt · Klick öffnet</span>
      </p>
    </div>
  );
}
