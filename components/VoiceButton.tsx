'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
};

/**
 * Voice input via the browser's speech recognition (Chrome, Edge, Safari).
 * Audio is processed by the browser/OS vendor; CLOQI only receives the recognised text.
 */
export function VoiceButton({ onText, onFinal, size = 44 }: { onText: (t: string) => void; onFinal?: (t: string) => void; size?: number }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = 'de-AT';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = e => {
      const text = Array.from(e.results).map(x => x[0].transcript).join(' ');
      onText(text);
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    r.onend = () => { setListening(false); if (finalText && onFinal) onFinal(finalText); finalText = ''; };
    r.onerror = () => setListening(false);
    rec.current = r;
    return () => r.stop();
  }, [onText, onFinal]);

  if (!supported) {
    return (
      <span title="Spracheingabe wird von diesem Browser nicht unterstützt (Chrome, Edge oder Safari verwenden)"
        className="grid shrink-0 place-items-center rounded-full bg-paper text-ink-faint" style={{ width: size, height: size }}>
        <MicOff size={18} />
      </span>
    );
  }
  return (
    <button
      type="button" aria-label={listening ? 'Zuhören beenden' : 'Sprechen'} aria-pressed={listening}
      onClick={() => { if (listening) rec.current?.stop(); else { try { rec.current?.start(); setListening(true); } catch { setListening(false); } } }}
      className={`relative grid shrink-0 place-items-center rounded-full transition ${listening ? 'bg-danger text-white' : 'bg-lime text-leaf-deep hover:bg-leaf hover:text-white'}`}
      style={{ width: size, height: size }}
    >
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" />}
      <Mic size={18} className="relative" />
    </button>
  );
}
