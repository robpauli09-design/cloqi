'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { MascotAvatar, type MascotName } from './Mascot';

type ToastKind = 'success' | 'error' | 'info';
interface ToastMsg { id: number; text: string; kind: ToastKind; mascot?: boolean }

/** Fire-and-forget toast from any client component. */
export function toast(text: string, kind: ToastKind = 'success', mascot = false) {
  window.dispatchEvent(new CustomEvent('cloqi:toast', { detail: { text, kind, mascot } }));
}

export function toastResult(r: { ok: boolean; message?: string; error?: string }, mascot = false) {
  if (r.ok) { if (r.message) toast(r.message, r.message.startsWith('Achtung') ? 'info' : 'success', mascot); }
  else toast(r.error ?? 'Etwas ist schiefgelaufen.', 'error');
}

export function Toaster({ mascot = 'cloki' }: { mascot?: MascotName }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let id = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<ToastMsg, 'id'>;
      const t = { ...d, id: ++id };
      setItems(xs => [...xs.slice(-2), t]);
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== t.id)), d.kind === 'error' ? 6000 : 4200);
    };
    window.addEventListener('cloqi:toast', on);
    return () => window.removeEventListener('cloqi:toast', on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end">
      {items.map(t => (
        <div key={t.id} className={`pointer-events-auto flex max-w-sm animate-rise items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lift
          ${t.kind === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : t.kind === 'info' ? 'border-warn/30 bg-warn-soft text-[#8a4a0e]' : 'border-leaf/30 bg-white text-ink'}`}>
          {t.mascot ? <MascotAvatar name={mascot} size={34} /> : t.kind === 'error' || t.kind === 'info' ? <AlertTriangle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0 text-leaf" />}
          <span>{t.text}</span>
          <button aria-label="Schließen" onClick={() => setItems(xs => xs.filter(x => x.id !== t.id))} className="ml-1 opacity-50 hover:opacity-100"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
