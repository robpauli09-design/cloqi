'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUp, BookOpenText, CalendarPlus, Camera, Check, Clock3, FileText, History, ImageIcon, Loader2, Mic, Paperclip, Plus,
  Sparkles, SquarePen, Sun, Trash2, X,
} from 'lucide-react';
import { askCloqi, confirmProposal, type Proposal } from '@/app/actions/assistant';
import { deleteThreadAction, listThreadsAction, openThreadAction, transcribeAction } from '@/app/actions/ai';
import { MascotAvatar, type MascotName } from '@/components/Mascot';
import { toast, toastResult } from '@/components/Toaster';
import { useRecorder } from '@/components/useRecorder';

interface Msg { id: string | number; from: 'user' | 'cloqi'; text: string; proposal?: Proposal; confirmLabel?: string; resolved?: boolean; actions?: string[]; error?: boolean; status?: string; streaming?: boolean }
type StreamEvent = { type: 'status'; text: string } | { type: 'delta'; text: string } | { type: 'reset' } | { type: 'done'; ok: boolean; reply: string; actions: string[]; threadId: string | null };
interface Attachment { name: string; mime: string; data: string; preview?: string }
interface Thread { id: string; title: string; updatedAt: string }

// A few quiet starters (short label, full sentence is sent). Same list in the app (mobile/src/app/(tabs)/ai.tsx).
const STARTERS = [
  { icon: CalendarPlus, label: 'Test eintragen', text: 'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.' },
  { icon: Sun, label: 'Was steht morgen an?', text: 'Was steht morgen an?' },
  { icon: Clock3, label: 'Freie Zeit diese Woche', text: 'Wann habe ich diese Woche Zeit für Freunde?' },
];
const MAX_FILES = 4;

/** Photos are scaled down in the browser (max 1600 px, JPEG) – faster, cheaper, enough for the AI. */
async function readAttachment(file: File): Promise<Attachment> {
  if (file.type === 'application/pdf') {
    if (file.size > 3 * 1024 * 1024) throw new Error('Das PDF ist zu groß (max. 3 MB).');
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { name: file.name, mime: 'application/pdf', data: btoa(bin) };
  }
  if (!file.type.startsWith('image/')) throw new Error('Nur Fotos und PDFs werden unterstützt.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: url.split(',')[1], preview: url };
}

export function Chat({ mascot, name, aiEnabled }: { mascot: MascotName; name: string; aiEnabled: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [pending, start] = useTransition();
  const [streaming, setStreaming] = useState(false);
  const busy = pending || streaming;
  const id = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const voice = useRecorder();
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' }); }, [messages, pending, streaming]);
  useEffect(() => { // empty chat fits the screen: no rubber-band scrolling (iPhone) while nothing is written
    if (messages.length) return;
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overscrollBehaviorY, body.style.overscrollBehaviorY];
    html.style.overscrollBehaviorY = 'none'; body.style.overscrollBehaviorY = 'none';
    return () => { html.style.overscrollBehaviorY = prev[0]; body.style.overscrollBehaviorY = prev[1]; };
  }, [messages.length]);
  useEffect(() => { // auto-grow the input
    const el = input.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  }, [text]);

  const send = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t && !files.length) return;
    const sending = files;
    setMessages(m => [...m, { id: `u${++id.current}`, from: 'user', text: t + (sending.length ? `${t ? '\n' : ''}📎 ${sending.map(f => f.name).join(', ')}` : '') }]);
    setText(''); setFiles([]); setMenu(false);
    if (aiEnabled) {
      // answer is streamed: status first ("Schaut in deinen Kalender …"), then the text piece by piece
      const aid = `a${++id.current}`;
      const patch = (f: (m: Msg) => Msg) => setMessages(ms => ms.map(m => (m.id === aid ? f(m) : m)));
      setMessages(m => [...m, { id: aid, from: 'cloqi', text: '', status: 'Denkt nach …', streaming: true }]);
      setStreaming(true);
      void (async () => {
        let finished = false;
        try {
          const res = await fetch('/api/ai/stream', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: t, threadId, attachments: sending.map(({ name, mime, data }) => ({ name, mime, data })) }),
          });
          if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Da ist etwas schiefgelaufen.');
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line) continue;
              const e = JSON.parse(line) as StreamEvent;
              if (e.type === 'status') patch(m => ({ ...m, status: e.text }));
              else if (e.type === 'delta') patch(m => ({ ...m, text: m.text + e.text, status: undefined }));
              else if (e.type === 'reset') patch(m => ({ ...m, text: '' }));
              else if (e.type === 'done') {
                finished = true;
                if (e.threadId) setThreadId(e.threadId);
                setThreads(null); // refresh history next time it opens
                patch(m => ({ ...m, text: e.reply, actions: e.actions, error: !e.ok, streaming: false, status: undefined }));
                if (e.actions.length) router.refresh();
              }
            }
          }
          if (!finished) throw new Error('Die Verbindung wurde unterbrochen. Versuch es bitte nochmal.');
        } catch (err) {
          patch(m => ({ ...m, text: err instanceof Error ? err.message : 'Da ist etwas schiefgelaufen.', error: true, streaming: false, status: undefined }));
        } finally {
          setStreaming(false);
        }
      })();
      return;
    }
    start(async () => {
      // fallback without a language model: rule-based commands with confirmation
      const q = /wann soll ich .*lernen/i.test(t) ? 'Wann habe ich Zeit zum Lernen?' : t;
      const r = await askCloqi(q);
      setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: r.reply, proposal: r.proposal, confirmLabel: r.confirmLabel }]);
    });
  }, [aiEnabled, router, threadId, files]);

  const confirm = (msg: Msg, yes: boolean) => start(async () => {
    setMessages(m => m.map(x => x.id === msg.id ? { ...x, resolved: true } : x));
    if (!yes) { setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: 'Okay, ich lasse alles, wie es ist.' }]); return; }
    const r = await confirmProposal(msg.proposal!);
    setMessages(m => [...m, { id: `a${++id.current}`, from: 'cloqi', text: r.reply }]);
  });

  const newChat = () => { setMessages([]); setThreadId(null); setFiles([]); setText(''); setHistoryOpen(false); input.current?.focus(); };

  const openHistory = () => {
    setHistoryOpen(true);
    if (!threads) start(async () => setThreads(await listThreadsAction()));
  };
  const openThread = (t: Thread) => start(async () => {
    const r = await openThreadAction(t.id);
    if (!r.ok) { toast('Dieser Chat existiert nicht mehr.', 'error'); return; }
    setThreadId(t.id);
    setMessages(r.messages.map(m => ({ id: m.id, from: m.role === 'user' ? 'user' : 'cloqi', text: m.content })));
    setHistoryOpen(false);
  });
  const removeThread = (t: Thread) => {
    if (!window.confirm(`„${t.title}“ löschen?`)) return;
    start(async () => {
      toastResult(await deleteThreadAction(t.id));
      setThreads(ts => ts?.filter(x => x.id !== t.id) ?? null);
      if (threadId === t.id) newChat();
    });
  };

  const addFiles = async (list: FileList | null) => {
    setMenu(false);
    if (!list?.length) return;
    try {
      const next = await Promise.all([...list].slice(0, MAX_FILES - files.length).map(readAttachment));
      setFiles(f => [...f, ...next].slice(0, MAX_FILES));
      if (list.length > MAX_FILES - files.length) toast(`Höchstens ${MAX_FILES} Anhänge pro Nachricht.`, 'info');
    } catch (e) { toast(e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.', 'error'); }
  };

  const startVoice = async () => {
    try { await voice.start(); } catch (e) { toast(e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Bitte erlaube den Zugriff aufs Mikrofon.', 'error'); }
  };
  const finishVoice = async () => {
    const blob = await voice.stop();
    if (!blob) return;
    setTranscribing(true);
    const form = new FormData();
    form.set('audio', new File([blob], blob.type.includes('mp4') ? 'aufnahme.mp4' : blob.type.includes('ogg') ? 'aufnahme.ogg' : 'aufnahme.webm', { type: blob.type }));
    const r = await transcribeAction(form);
    setTranscribing(false);
    if (r.ok && r.text) { setText(t => (t ? `${t} ${r.text}` : r.text!)); input.current?.focus(); } else toast(r.error ?? 'Spracherkennung fehlgeschlagen.', 'error');
  };

  const canSend = Boolean(text.trim() || files.length) && !busy;
  const iconBtn = 'grid h-9 w-9 place-items-center rounded-xl text-ink-soft transition hover:bg-white hover:text-leaf-dark';

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9.5rem)] max-w-3xl flex-col lg:min-h-[calc(100dvh-4.5rem)]">
      <header className="flex items-center gap-1 border-b border-line pb-3">
        <h1 className="flex-1 font-display text-lg font-semibold">CLOQI AI{aiEnabled ? '' : <span className="ml-2 text-xs font-medium text-ink-faint">Basis-Modus</span>}</h1>
        <Link href="/vault" className={iconBtn} aria-label="Wissen" title="Wissen"><BookOpenText size={19} /></Link>
        {aiEnabled && <button className={iconBtn} aria-label="Chat-Verlauf" title="Chat-Verlauf" onClick={openHistory}><History size={19} /></button>}
        {aiEnabled && messages.length > 0 && <button className={iconBtn} aria-label="Neuer Chat" title="Neuer Chat" onClick={newChat}><SquarePen size={19} /></button>}
      </header>

      <div className={`mt-4 flex-1 space-y-4 ${messages.length === 0 ? 'flex flex-col items-center justify-center' : ''}`}>
        {messages.length === 0 && (
          <div className="flex w-full max-w-sm animate-rise flex-col items-center text-center">
            <MascotAvatar name={mascot} size={56} />
            <h2 className="mt-4 font-display text-2xl font-semibold">Was steht an{name ? `, ${name}` : ''}?</h2>
            <p className="mt-1 text-sm text-ink-soft">Schreib oder sprich es einfach – ich trage es ein und plane drumherum.</p>
            <div className="mt-7 w-full space-y-2">
              {STARTERS.map(({ icon: Icon, label, text: t }) => (
                <button key={label} onClick={() => send(t)}
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
            <MascotAvatar name={mascot} size={32} />
            <div className={`max-w-[85%] animate-rise rounded-2xl rounded-bl-md border px-4 py-3 text-sm shadow-card ${m.error ? 'border-danger/30 bg-danger-soft/60' : 'border-line bg-white'}`}>
              {m.streaming && !m.text
                ? <p className="flex items-center gap-2 text-xs text-ink-soft"><Loader2 size={14} className="animate-spin text-leaf" />{m.status ?? 'Denkt nach …'}</p>
                : <p className="whitespace-pre-line">{m.text}{m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-leaf-dark align-text-bottom" />}</p>}
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
        {pending && messages.length > 0 && messages[messages.length - 1].from === 'user' && (
          <div className="flex items-end gap-2">
            <MascotAvatar name={mascot} size={32} />
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-xs text-ink-soft"><Loader2 size={14} className="animate-spin text-leaf" /> CLOQI denkt nach …</div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* hidden pickers: camera (phones open the camera), photo library, files */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={photos} type="file" accept="image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={docs} type="file" accept="application/pdf,image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />

      <div className="sticky bottom-28 mt-6 lg:bottom-4">
        {menu && (
          <div className="absolute bottom-full left-0 mb-2 w-56 animate-pop rounded-2xl border border-line bg-white p-1.5 shadow-lift" role="menu">
            {[
              { label: 'Foto aufnehmen', icon: Camera, ref: camera },
              { label: 'Foto auswählen', icon: ImageIcon, ref: photos },
              { label: 'Datei hochladen', icon: Paperclip, ref: docs },
            ].map(({ label, icon: Icon, ref }) => (
              <button key={label} role="menuitem" onClick={() => ref.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-leaf-soft hover:text-leaf-deep">
                <Icon size={17} className="text-leaf-dark" />{label}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-[26px] border border-line bg-white p-2 shadow-card">
          {files.length > 0 && !voice.recording && (
            <div className="flex gap-2 overflow-x-auto px-1 pb-2">
              {files.map((f, i) => (
                <div key={i} className="relative shrink-0">
                  {f.preview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.preview} alt={f.name} className="h-16 w-16 rounded-xl object-cover" />
                    : <div className="flex h-16 w-28 flex-col justify-center gap-1 rounded-xl bg-paper px-2 text-xs"><FileText size={16} className="text-leaf-dark" /><span className="truncate">{f.name}</span></div>}
                  <button onClick={() => setFiles(x => x.filter((_, j) => j !== i))} aria-label={`${f.name} entfernen`}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}

          {voice.recording || transcribing ? (
            <div className="flex items-center gap-2">
              <button onClick={voice.cancel} disabled={transcribing} aria-label="Aufnahme verwerfen"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-paper disabled:opacity-40"><X size={20} /></button>
              <div className="flex h-10 flex-1 items-center justify-center gap-[3px] overflow-hidden" aria-live="polite">
                {transcribing
                  ? <span className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin text-leaf" /> Wird umgewandelt …</span>
                  : voice.levels.map((l, i) => (
                    <span key={i} className="w-[3px] rounded-full bg-leaf-dark transition-[height] duration-100" style={{ height: `${Math.round(6 + l * 30)}px`, opacity: 0.35 + l * 0.65 }} />
                  ))}
              </div>
              {!transcribing && <span className="w-10 text-xs tabular-nums text-ink-faint">{Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}</span>}
              <button onClick={() => void finishVoice()} disabled={transcribing} aria-label="Aufnahme fertig"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf-dark text-white disabled:opacity-40"><Check size={19} /></button>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); send(text); }} className="flex items-end gap-1.5">
              <button type="button" onClick={() => setMenu(m => !m)} disabled={!aiEnabled} aria-label="Foto oder Datei hinzufügen" aria-expanded={menu}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper disabled:opacity-40 ${menu ? 'rotate-45 bg-paper' : ''}`}>
                <Plus size={21} />
              </button>
              <textarea ref={input} value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={1} aria-label="Nachricht an CLOQI"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
                placeholder="Schreib CLOQI …" className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm outline-none" />
              {canSend ? (
                <button className="grid h-10 w-10 shrink-0 animate-pop place-items-center rounded-full bg-leaf-dark text-white" aria-label="Senden"><ArrowUp size={19} /></button>
              ) : (
                <button type="button" onClick={() => void startVoice()} disabled={!aiEnabled || busy} aria-label="Sprechen" title="Sprechen"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-leaf-dark disabled:opacity-40">
                  <Mic size={20} />
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) setHistoryOpen(false); }}>
          <aside className="flex h-full w-full max-w-sm animate-rise flex-col bg-paper shadow-lift" aria-label="Chat-Verlauf">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="flex-1 font-display text-lg font-semibold">Verlauf</h2>
              <button className={iconBtn} onClick={newChat} aria-label="Neuer Chat" title="Neuer Chat"><SquarePen size={19} /></button>
              <button className={iconBtn} onClick={() => setHistoryOpen(false)} aria-label="Schließen"><X size={19} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {!threads && <p className="flex items-center gap-2 p-3 text-sm text-ink-soft"><Loader2 size={15} className="animate-spin text-leaf" /> Lädt …</p>}
              {threads?.length === 0 && <p className="p-3 text-sm text-ink-soft">Noch keine Chats.</p>}
              {threads?.map(t => (
                <div key={t.id} className={`group flex items-center gap-1 rounded-xl ${t.id === threadId ? 'bg-leaf-soft' : 'hover:bg-white'}`}>
                  <button onClick={() => openThread(t)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block text-xs text-ink-faint">{new Date(t.updatedAt).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })}</span>
                  </button>
                  <button onClick={() => removeThread(t)} aria-label={`„${t.title}“ löschen`}
                    className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-ink-faint opacity-60 hover:bg-danger-soft hover:text-danger group-hover:opacity-100"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
