'use client';

import { useCallback, useState, useTransition } from 'react';
import { ArrowUp, Check, Loader2 } from 'lucide-react';
import { askCloqi, confirmProposal, type AssistantReply } from '@/app/actions/assistant';
import { Mascot, type MascotName } from './Mascot';
import { VoiceButton } from './VoiceButton';
import { toast } from './Toaster';

/** Compact "say it" input: text or voice → proposal → confirm. */
export function AssistantInline({ mascot, placeholder }: { mascot: MascotName; placeholder: string }) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [pending, start] = useTransition();

  const send = useCallback((t: string) => {
    if (!t.trim()) return;
    start(async () => setReply(await askCloqi(t)));
  }, []);

  return (
    <div className="card card-pad bg-gradient-to-br from-white to-leaf-soft/70">
      <form onSubmit={e => { e.preventDefault(); send(text); }} className="flex items-center gap-2">
        <VoiceButton onText={setText} onFinal={send} />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={500} placeholder={placeholder} aria-label="Nachricht an CLOQI"
          className="input h-11 flex-1 rounded-full px-5" />
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-dark text-white disabled:opacity-40" disabled={pending || !text.trim()} aria-label="Senden">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
        </button>
      </form>
      {reply && (
        <div className="mt-4 animate-rise">
          <Mascot name={mascot} variant="head" size={44} message={<span className="whitespace-pre-line">{reply.reply}</span>} />
          {reply.proposal && (
            <div className="ml-14 mt-2 flex gap-2">
              <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
                const r = await confirmProposal(reply.proposal!);
                toast(r.reply, r.ok ? 'success' : 'error', r.ok);
                setReply(r.ok ? null : { reply: r.reply });
                if (r.ok) setText('');
              })}><Check size={14} /> {reply.confirmLabel ?? 'Ja'}</button>
              <button className="btn-ghost btn-sm" onClick={() => setReply(null)}>Abbrechen</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
