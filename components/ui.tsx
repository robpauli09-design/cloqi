'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { CATEGORY_META, type Category } from '@/lib/types';

export function SubmitButton({ children, className = 'btn-primary', pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function CategoryDot({ category, size = 8 }: { category: Category; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: CATEGORY_META[category].color }} />;
}

export function CategoryChip({ category }: { category: Category }) {
  const m = CATEGORY_META[category];
  return <span className="chip" style={{ background: m.soft, color: m.text }}>{m.label}</span>;
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} data-on={on} className="toggle disabled:opacity-50" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message?: string; error?: string } | null }) {
  if (!state) return null;
  if (!state.ok) return <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{state.error}</p>;
  if (!state.message) return null;
  const warn = state.message.startsWith('Achtung');
  return <p className={`rounded-xl px-3 py-2 text-sm font-medium ${warn ? 'bg-warn-soft text-[#8a4a0e]' : 'bg-leaf-soft text-leaf-dark'}`}>{state.message}</p>;
}

export function ProgressRing({ value, size = 88, stroke = 9, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDF6E3" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#7CC51B" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
