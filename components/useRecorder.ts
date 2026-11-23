'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const BARS = 24;

/**
 * Records the microphone in the browser (MediaRecorder) and exposes live levels for an animated
 * waveform. The finished recording is transcribed on the server (same as in the app).
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef<((b: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach(t => t.stop());
    void audioCtx.current?.close().catch(() => {});
    raf.current = null; timer.current = null; stream.current = null; audioCtx.current = null;
    setRecording(false);
    setLevels(Array(BARS).fill(0.08));
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Dein Browser kann keine Sprachaufnahmen machen.');
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.current = s;
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
    chunks.current = [];
    r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const blob = chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }) : null;
      cleanup();
      done.current?.(blob);
      done.current = null;
    };
    rec.current = r;
    r.start();

    // live level → animated bars
    const ctx = new AudioContext();
    audioCtx.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    ctx.createMediaStreamSource(s).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      setLevels(prev => [...prev.slice(1), Math.max(0.08, Math.min(1, avg * 2.4))]);
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    setSeconds(0);
    timer.current = setInterval(() => setSeconds(x => x + 1), 1000);
    setRecording(true);
  }, [cleanup]);

  /** Stops and resolves with the recording (null if empty). */
  const stop = useCallback(() => new Promise<Blob | null>(resolve => {
    if (!rec.current || rec.current.state === 'inactive') { cleanup(); resolve(null); return; }
    done.current = resolve;
    rec.current.stop();
  }), [cleanup]);

  const cancel = useCallback(() => {
    done.current = null;
    if (rec.current && rec.current.state !== 'inactive') { rec.current.onstop = () => cleanup(); rec.current.stop(); } else cleanup();
  }, [cleanup]);

  return { recording, levels, seconds, start, stop, cancel };
}
