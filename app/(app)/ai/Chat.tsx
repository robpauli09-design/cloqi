'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp, BookOpenText, CalendarPlus, Check, Clock3, Loader2, SquarePen, Sparkles, Sun } from 'lucide-react';
import { askCloqi, confirmProposal, type Proposal } from '@/app/actions/assistant';
import { chatWithCloqi, clearChatAction } from '@/app/actions/ai';
import { Mascot, MascotAvatar, type MascotName } from '@/components/Mascot';
import { VoiceButton } from '@/components/VoiceButton';
import { toastResult } from '@/components/Toaster';

interface Msg { id: string | number; from: 'user' | 'cloqi'; text: string; proposal?: Proposal; confirmLabel?: string; resolved?: boolean; actions?: string[]; error?: boolean }

// A few quiet starters (short label, full sentence is sent). Same list in the app (mobile/src/app/(tabs)/ai.tsx).
const STARTERS = [
  { icon: CalendarPlus, label: 'Test eintragen', text: 'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.' },
  { icon: Sun, label: 'Was steht morgen an?', text: 'Was steht morgen an?' },
  { icon: Clock3, label: 'Freie Zeit diese Woche', text: 'Wann habe ich diese Woche Zeit für Freunde?' },
];

export function Chat({ mascot, name, aiEnabled, history }: { mascot: MascotName; name: string; aiEnabled: boolean; history: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(history);
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const id = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, pending]);

  const send = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setMessages(m => [...m, { id: `u${++id.current}`, from: 'user', text: t }]);
    setText('');
    start(async () => {
      if (aiEnabled) {
        const r = await chatWithCloqi(t);
        setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: r.reply, actions: r.actions, error: !r.ok }]);
        if (r.actions.length) router.refresh();
        return;
      }
      // fallback without a language model: rule-based commands with confirmation
      const q = /wann soll ich .*lernen/i.test(t) ? 'Wann habe ich Zeit zum Lernen?' : t;
      const r = await askCloqi(q);
      setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: r.reply, proposal: r.proposal, confirmLabel: r.confirmLabel }]);
    });
  }, [aiEnabled, router]);

  const confirm = (msg: Msg, yes: boolean) => start(async () => {
    setMessages(m => m.map(x => x.id === msg.id ? { ...x, resolved: true } : x));
    if (!yes) { setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: 'Okay, ich lasse alles, wie es ist.' }]); return; }
    const r = await confirmProposal(msg.proposal!);
    setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: r.reply }]);
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9.5rem)] max-w-3xl flex-col lg:min-h-[calc(100dvh-4.5rem)]">
      <header className="flex items-center gap-2 border-b border-line pb-3">
        <h1 className="flex-1 font-display text-lg font-semibold">CLOQI AI{aiEnabled ? '' : <span className="ml-2 text-xs font-medium text-ink-faint">Basis-Modus</span>}</h1>
        <Link href="/vault" className="grid h-9 w-9 place-items-center rounded-xl text-ink-soft hover:bg-white hover:text-leaf-dark" aria-label="Wissen" title="Wissen"><BookOpenText size={18} /></Link>
        {aiEnabled && messages.length > 0 && (
          <button className="grid h-9 w-9 place-items-center rounded-xl text-ink-soft hover:bg-white hover:text-leaf-dark" aria-label="Neuer Chat" title="Neuer Chat" disabled={pending}
            onClick={() => start(async () => { toastResult(await clearChatAction()); setMessages([]); })}>
            <SquarePen size={18} />
          </button>
        )}
      </header>

      <div className={`mt-4 flex-1 space-y-4 ${messages.length === 0 ? 'flex flex-col items-center justify-center' : ''}`}>
        {messages.length === 0 && (
          <div className="flex w-full max-w-sm animate-rise flex-col items-center text-center">
            <MascotAvatar name={mascot} size={56} />
            <h2 className="mt-4 font-display text-2xl font-semibold">Was steht an{name ? `, ${name}` : ''}?</h2>
            <p className="mt-1 text-sm text-ink-soft">Schreib es einfach – ich trage es ein und plane drumherum.</p>
            <div className="mt-7 w-full space-y-2">
              {STARTERS.map(({ icon: Icon, label, text }) => (
                <button key={label} onClick={() => send(text)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white/60 px-4 py-3 text-left text-sm text-ink-soft transition hover:border-leaf/50 hover:bg-white hover:text-ink">
                  <Icon size={16} className="shrink-0 text-leaf-dark" />{label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(m => m.from === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <p className="max-w-[80%] animate-rise whitespace-pre-line rounded-2xl rounded-br-md bg-leaf-dark px-4 py-2.5 text-sm font-medium text-white">{m.text}</p>
          </div>
        ) : (
          <div key={m.id} className="flex items-end gap-2">
            <MascotAvatar name={mascot} size={36} />
            <div className={`max-w-[85%] animate-rise rounded-2xl rounded-bl-md border px-4 py-3 text-sm shadow-card ${m.error ? 'border-danger/30 bg-danger-soft/60' : 'border-line bg-white'}`}>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.actions && m.actions.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-2">
                  {m.actions.map((a, i) => <li key={i} className="flex items-start gap-1.5 text-xs text-leaf-dark"><Sparkles size={12} className="mt-0.5 shrink-0" />{a}</li>)}
                </ul>
              )}
              {m.proposal && !m.resolved && (
                <div className="mt-3 flex gap-2">
                  <button className="btn-primary btn-sm" disabled={pending} onClick={() => confirm(m, true)}><Check size={14} /> {m.confirmLabel ?? 'Ja'}</button>
                  <button className="btn-ghost btn-sm" disabled={pending} onClick={() => confirm(m, false)}>Nein</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-end gap-2">
            <MascotAvatar name={mascot} size={36} />
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-xs text-ink-soft"><Loader2 size={14} className="animate-spin text-leaf" /> CLOQI denkt nach …</div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send(text); }}
        className="sticky bottom-28 mt-6 flex items-center gap-2 rounded-full border border-line bg-white p-2 shadow-card lg:bottom-4">
        <VoiceButton onText={setText} onFinal={send} />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={2000} aria-label="Nachricht an CLOQI"
          placeholder="Schreib CLOQI …" className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-dark text-white disabled:opacity-40" disabled={pending || !text.trim()} aria-label="Senden">
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}
