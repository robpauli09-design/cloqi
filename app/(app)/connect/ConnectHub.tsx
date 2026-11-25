'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';

export interface HubItem {
  id: string;                    // also the #hash that opens it (e.g. /connect#webuntis)
  name: string;
  description: string;
  icon: React.ReactNode;
  state: 'connected' | 'problem' | 'available' | 'soon';
  detail?: string;               // e.g. "Klasse 4DK · zuletzt 06:50"
  action?: string;               // button text when not connected (default "Verbinden")
  panel: React.ReactNode;        // the settings (existing forms) shown in the side panel
}

const STATE_CHIP: Record<HubItem['state'], [string, string] | null> = {
  connected: ['Verbunden', 'bg-leaf-soft text-leaf-dark'],
  problem: ['Bitte prüfen', 'bg-warn-soft text-[#a55912]'],
  available: null,
  soon: ['Bald verfügbar', 'bg-paper text-ink-faint'],
};

/**
 * Integrations overview like Notion/Linear/Vercel: what's connected on top, everything else as compact rows
 * grouped by purpose; settings open in a side panel instead of crowding the page.
 */
export function ConnectHub({ groups }: { groups: { title: string; hint: string; items: HubItem[] }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const all = groups.flatMap(g => g.items);
  const connected = all.filter(i => i.state === 'connected' || i.state === 'problem');
  const current = all.find(i => i.id === open) ?? null;

  // deep links (/connect#webuntis from onboarding and Home) open the right panel
  useEffect(() => {
    const fromHash = () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && all.some(i => i.id === h && i.state !== 'soon')) setOpen(h); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = useCallback(() => { setOpen(null); if (location.hash) history.replaceState(null, '', location.pathname + location.search); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  const row = (i: HubItem) => {
    const chip = STATE_CHIP[i.state];
    const disabled = i.state === 'soon';
    return (
      <li key={i.id}>
        <button type="button" disabled={disabled} onClick={() => setOpen(i.id)} aria-haspopup="dialog"
          className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-paper/70 disabled:cursor-default disabled:hover:bg-transparent sm:px-5">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-paper text-lg font-bold ${disabled ? 'opacity-50' : ''}`}>{i.icon}</span>
          <span className="min-w-0 flex-1">
            <span className={`block font-semibold ${disabled ? 'text-ink-soft' : ''}`}>{i.name}</span>
            <span className="line-clamp-2 text-sm text-ink-soft sm:line-clamp-1">{i.detail ?? i.description}</span>
          </span>
          {chip && <span className={`chip shrink-0 ${i.state === 'soon' ? 'inline-flex' : 'hidden sm:inline-flex'} ${chip[1]}`}>{i.state === 'soon' ? <><span className="sm:hidden">Bald</span><span className="hidden sm:inline">{chip[0]}</span></> : chip[0]}</span>}
          {!disabled && (i.state === 'available'
            ? <span className="btn-outline btn-sm shrink-0">{i.action ?? 'Verbinden'}</span>
            : <ChevronRight size={18} className="shrink-0 text-ink-faint transition group-hover:translate-x-0.5" />)}
        </button>
      </li>
    );
  };

  return (
    <>
      {connected.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-ink-faint">Verbunden</h2>
          <ul className="card divide-y divide-line overflow-hidden !p-0">{connected.map(row)}</ul>
        </section>
      )}
      {groups.map(g => {
        const items = g.items.filter(i => !connected.includes(i));
        if (!items.length) return null;
        return (
          <section key={g.title}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-faint">{g.title}</h2>
              <p className="hidden text-xs text-ink-faint sm:block">{g.hint}</p>
            </div>
            <ul className="card divide-y divide-line overflow-hidden !p-0">{items.map(row)}</ul>
          </section>
        );
      })}

      {current && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-label={current.name}
            className="flex h-full w-full max-w-xl animate-[slideIn_.2s_ease-out] flex-col bg-paper shadow-lift">
            <div className="flex items-center gap-3 border-b border-line bg-white px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-paper font-bold">{current.icon}</span>
              <h2 className="flex-1 font-display text-lg font-semibold">{current.name}</h2>
              <button className="rounded-full p-2 text-ink-faint hover:bg-paper" aria-label="Schließen" onClick={close}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 [&_.card]:shadow-none [&_.card>div:first-child:has(h2)]:hidden">{current.panel}</div>
          </div>
        </div>
      )}
    </>
  );
}
