'use client';

import { useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';
import { transcribeAction } from '@/app/actions/ai';
import { toast } from './Toaster';
import { useRecorder } from './useRecorder';

/**
 * Voice input: records in the browser and transcribes on the server – the same way as the
 * CLOQI AI chat (works on iPhone/Safari too, unlike the browser's own speech recognition).
 * Tap to start, ✓ to finish (text is passed to onText/onFinal), ✕ to discard.
 */
export function VoiceButton({ onText, onFinal, size = 44 }: { onText: (t: string) => void; onFinal?: (t: string) => void; size?: number }) {
  const voice = useRecorder();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    try { await voice.start(); } catch (e) {
      toast(e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Bitte erlaube den Zugriff aufs Mikrofon.', 'error');
    }
  };
  const finish = async () => {
    const blob = await voice.stop();
    if (!blob) return;
    setBusy(true);
    const form = new FormData();
    form.set('audio', new File([blob], blob.type.includes('mp4') ? 'aufnahme.mp4' : blob.type.includes('ogg') ? 'aufnahme.ogg' : 'aufnahme.webm', { type: blob.type }));
    const r = await transcribeAction(form);
    setBusy(false);
    if (r.ok && r.text) { onText(r.text); onFinal?.(r.text); } else toast(r.error ?? 'Spracherkennung fehlgeschlagen.', 'error');
  };

  if (busy) {
    return <span className="grid shrink-0 place-items-center rounded-full bg-paper text-leaf" style={{ width: size, height: size }} aria-label="Wird umgewandelt"><Loader2 size={18} className="animate-spin" /></span>;
  }
  if (voice.recording) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={voice.cancel} aria-label="Aufnahme verwerfen" className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-paper"><X size={17} /></button>
        <span className="flex h-8 items-center gap-[2px]" aria-hidden>
          {voice.levels.slice(-12).map((l, i) => <span key={i} className="w-[3px] rounded-full bg-leaf-dark" style={{ height: `${Math.round(5 + l * 22)}px`, opacity: 0.4 + l * 0.6 }} />)}
        </span>
        <button type="button" onClick={() => void finish()} aria-label="Aufnahme fertig"
          className="grid shrink-0 place-items-center rounded-full bg-leaf-dark text-white" style={{ width: size, height: size }}><Check size={18} /></button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => void start()} aria-label="Sprechen" title="Sprechen"
      className="grid shrink-0 place-items-center rounded-full bg-lime text-leaf-deep transition hover:bg-leaf hover:text-white" style={{ width: size, height: size }}>
      <Mic size={18} />
    </button>
  );
}
