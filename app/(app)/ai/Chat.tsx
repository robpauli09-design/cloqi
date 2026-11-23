'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ArrowUp, Check, Loader2 } from 'lucide-react';
import { askCloqi, confirmProposal, type Proposal } from '@/app/actions/assistant';
import { Mascot, MascotAvatar, type MascotName } from '@/components/Mascot';
import { VoiceButton } from '@/components/VoiceButton';

interface Msg { id: number; from: 'user' | 'cloqi'; text: string; proposal?: Proposal; confirmLabel?: string; resolved?: boolean }

const EXAMPLES = [
  'Wann soll ich für Mathe lernen?',
  'Was steht morgen an?',
  'Wann habe ich diese Woche Zeit?',
  'Ich habe am Freitag einen Englisch-Test.',
  'Trag morgen Training um 18 Uhr ein.',
  'Welche Tests stehen bald an?',
  'Verschiebe meine Lernsession auf Mittwoch.',
  'Kannst du meinen Lernplan anpassen?',
];

export function Chat({ mascot, name }: { mascot: MascotName; name: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const id = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, pending]);

  const send = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setMessages(m => [...m, { id: ++id.current, from: 'user', text: t }]);
    setText('');
    start(async () => {
      // "Wann soll ich für Mathe lernen?" → the planner answers with free slots
      const q = /wann soll ich .*lernen/i.test(t) ? 'Wann habe ich Zeit zum Lernen?' : t;
      const r = await askCloqi(q);
      setMessages(m => [...m, { id: ++id.current, from: 'cloqi', text: r.reply, proposal: r.proposal, confirmLabel: r.confirmLabel }]);
    });
  }, []);

  const confirm = (msg: Msg, yes: boolean) => start(async () => {
    setMessages(m => m.map(x => x.id === msg.id ? { ...x, resolved: true } : x));
    if (!yes) { setMessages(m => [...m, { id: ++id.current, from: 'cloqi', text: 'Okay, ich lasse alles, wie es ist.' }]); return; }
    const r = await confirmProposal(msg.proposal!);
    setMessages(m => [...m, { id: ++id.current, from: 'cloqi', text: r.reply }]);
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: 'calc(100vh - 9rem)' }}>
      <header className="flex items-center gap-4">
        <Mascot name={mascot} variant="bust" size={92} />
        <div>
          <p className="eyebrow !text-ai">CLOQI AI</p>
          <h1 className="h1">Frag CLOQI</h1>
          <p className="muted">Ich helfe dir, deinen Alltag einfacher zu organisieren.</p>
        </div>
      </header>

      <div className="mt-6 flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="card card-pad">
            <p className="font-semibold">Hey {name || 'du'}! Frag mich etwas oder sag mir, was ansteht – tippen oder sprechen.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map(e => (
                <button key={e} onClick={() => send(e)} className="chip bg-ai-soft px-3 py-1.5 text-sm text-ai hover:bg-ai hover:text-white">{e}</button>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-faint">
              CLOQI AI arbeitet mit deinen echten Kalenderdaten und erfindet keine Termine. Änderungen führe ich erst aus, wenn du sie bestätigst.
            </p>
          </div>
        )}
        {messages.map(m => m.from === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <p className="max-w-[80%] animate-rise rounded-2xl rounded-br-md bg-leaf-dark px-4 py-2.5 text-sm font-medium text-white">{m.text}</p>
          </div>
        ) : (
          <div key={m.id} className="flex items-end gap-2">
            <MascotAvatar name={mascot} size={36} />
            <div className="max-w-[85%] animate-rise rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-sm shadow-card">
              <p className="whitespace-pre-line">{m.text}</p>
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
            <div className="rounded-2xl border border-line bg-white px-4 py-3"><Loader2 size={16} className="animate-spin text-leaf" /></div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send(text); }}
        className="sticky bottom-20 mt-6 flex items-center gap-2 rounded-full border border-line bg-white p-2 shadow-lift lg:bottom-4">
        <VoiceButton onText={setText} onFinal={send} />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={500} aria-label="Nachricht an CLOQI"
          placeholder="„CLOQI, ich habe am Freitag einen Englisch-Test.“" className="h-11 flex-1 bg-transparent px-2 text-sm outline-none" />
        <button className="grid h-11 w-11 place-items-center rounded-full bg-leaf-dark text-white disabled:opacity-40" disabled={pending || !text.trim()} aria-label="Senden">
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}
