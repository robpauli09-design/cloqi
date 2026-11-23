'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp, BookOpenText, Check, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { askCloqi, confirmProposal, type Proposal } from '@/app/actions/assistant';
import { chatWithCloqi, clearChatAction } from '@/app/actions/ai';
import { Mascot, MascotAvatar, type MascotName } from '@/components/Mascot';
import { VoiceButton } from '@/components/VoiceButton';
import { toastResult } from '@/components/Toaster';

interface Msg { id: string | number; from: 'user' | 'cloqi'; text: string; proposal?: Proposal; confirmLabel?: string; resolved?: boolean; actions?: string[]; error?: boolean }

const EXAMPLES = [
  'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.',
  'Ich trainiere Dienstag und Donnerstag von 17 bis 18:30 Fußball.',
  'Was steht morgen an?',
  'Wann habe ich diese Woche Zeit für Freunde?',
  'Plane mir nächste Woche drei Lernstunden für BWL ein.',
  'Englisch fällt mir schwer, Mathe eher leicht.',
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
    <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: 'calc(100vh - 9rem)' }}>
      <header className="flex flex-wrap items-center gap-4">
        <Mascot name={mascot} variant="bust" size={92} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow !text-ai">CLOQI AI {aiEnabled ? '' : '· Basis-Modus'}</p>
          <h1 className="h1">Frag CLOQI</h1>
          <p className="muted">Ich helfe dir, deinen Alltag einfacher zu organisieren – und merke mir, was dir wichtig ist.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/vault" className="btn-outline btn-sm"><BookOpenText size={14} /> Wissen</Link>
          {aiEnabled && messages.length > 0 && (
            <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { toastResult(await clearChatAction()); setMessages([]); })}>
              <Trash2 size={14} /> Neuer Chat
            </button>
          )}
        </div>
      </header>

      <div className="mt-6 flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="card card-pad">
            <p className="font-semibold">Hey {name || 'du'}! Erzähl mir, was ansteht – tippen oder sprechen. Ich trage alles ein und plane drumherum.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map(e => (
                <button key={e} onClick={() => send(e)} className="chip bg-ai-soft px-3 py-1.5 text-left text-sm text-ai hover:bg-ai hover:text-white">{e}</button>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-faint">
              {aiEnabled
                ? 'CLOQI arbeitet mit deinen echten Kalenderdaten, erfindet keine Termine und merkt sich Wichtiges in deinem Wissens-Vault. Jede Änderung siehst du hier und unter Wissen → wiki/log.md.'
                : 'Basis-Modus: Ohne eingerichtetes Sprachmodell versteht CLOQI kurze Kalenderbefehle und fragt vor jeder Änderung nach.'}
            </p>
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
        className="sticky bottom-20 mt-6 flex items-center gap-2 rounded-full border border-line bg-white p-2 shadow-lift lg:bottom-4">
        <VoiceButton onText={setText} onFinal={send} />
        <input value={text} onChange={e => setText(e.target.value)} maxLength={2000} aria-label="Nachricht an CLOQI"
          placeholder="„CLOQI, ich habe am Freitag einen Englisch-Test.“" className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-dark text-white disabled:opacity-40" disabled={pending || !text.trim()} aria-label="Senden">
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}
