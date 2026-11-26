'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FastForward, Hand, PencilLine } from 'lucide-react';
import { AI_MODES, type AiMode } from '@/lib/types';

const ICON: Record<AiMode, typeof Hand> = { ask: Hand, edit: PencilLine, auto: FastForward };
export const nextMode = (m: AiMode): AiMode => AI_MODES[(AI_MODES.findIndex(x => x.id === m) + 1) % AI_MODES.length].id;

/** Mode switch under the chat input – like Claude/ChatGPT: how much CLOQI does on its own. */
export function ModeSwitch({ mode, onChange, disabled }: { mode: AiMode; onChange: (m: AiMode) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const cur = AI_MODES.find(m => m.id === mode)!;
  const Icon = ICON[mode];
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        title="Modus wechseln (Shift + Tab)"
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${mode === 'auto' ? 'text-ai hover:bg-ai-soft' : mode === 'ask' ? 'text-[#a55912] hover:bg-warn-soft' : 'text-ink-soft hover:bg-white'}`}>
        <Icon size={13} /> {cur.label} <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Modus" className="absolute bottom-full left-0 z-30 mb-2 w-[min(320px,calc(100vw-2rem))] animate-pop rounded-2xl border border-line bg-white p-1.5 shadow-lift">
          <p className="flex items-center justify-between px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Modus <span className="hidden font-medium normal-case tracking-normal sm:inline">Shift + Tab zum Wechseln</span>
          </p>
          {AI_MODES.map(m => {
            const I = ICON[m.id];
            return (
              <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === mode} onClick={() => { onChange(m.id); setOpen(false); }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-paper ${m.id === mode ? 'bg-paper' : ''}`}>
                <I size={16} className="mt-0.5 shrink-0 text-ink-soft" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{m.label}</span><span className="block text-xs text-ink-soft">{m.hint}</span></span>
                {m.id === mode && <Check size={16} className="mt-0.5 shrink-0 text-leaf-dark" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
