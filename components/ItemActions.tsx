'use client';

import { useTransition } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { setBlockDone } from '@/app/actions/calendar';
import { respondToSuggestion } from '@/app/actions/settings';
import { toast, toastResult } from './Toaster';

export function StudyCheck({ id, done, size = 'md' }: { id: string; done: boolean; size?: 'sm' | 'md' }) {
  const [pending, start] = useTransition();
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  return (
    <button
      type="button" aria-pressed={done} aria-label={done ? 'Als offen markieren' : 'Als erledigt abhaken'} disabled={pending}
      onClick={() => start(async () => {
        const r = await setBlockDone(id, !done);
        if (r.ok && !done) toast('Stark! Du hast deine Lernsession abgeschlossen.', 'success', true);
        else toastResult(r);
      })}
      className={`grid ${dim} shrink-0 place-items-center rounded-full border-2 transition
        ${done ? 'border-leaf bg-leaf text-white' : 'border-leaf/50 bg-white text-transparent hover:border-leaf hover:text-leaf/50'}`}>
      {pending ? <Loader2 size={14} className="animate-spin text-leaf" /> : <Check size={size === 'sm' ? 13 : 16} strokeWidth={3} />}
    </button>
  );
}

export function SuggestionActions({ id, kind }: { id: string; kind: string }) {
  const [pending, start] = useTransition();
  const run = (accept: boolean, choice?: string) => start(async () => toastResult(await respondToSuggestion(id, accept, choice), accept));
  if (kind === 'sync_conflict') {
    return (
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} onClick={() => run(true, 'cloqi')} className="btn-primary btn-sm">CLOQI-Version behalten</button>
        <button disabled={pending} onClick={() => run(true, 'remote')} className="btn-outline btn-sm">Externe Version übernehmen</button>
        <button disabled={pending} onClick={() => run(false)} className="btn-ghost btn-sm">Später</button>
      </div>
    );
  }
  if (kind === 'change' || kind === 'info') {
    return <button disabled={pending} onClick={() => run(false)} className="btn-ghost btn-sm"><X size={14} /> Verstanden</button>;
  }
  return (
    <div className="flex gap-2">
      <button disabled={pending} onClick={() => run(true)} className="btn-primary btn-sm">{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Ja, bitte</button>
      <button disabled={pending} onClick={() => run(false)} className="btn-ghost btn-sm">Nein, danke</button>
    </div>
  );
}
