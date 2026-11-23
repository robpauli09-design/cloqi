'use client';

import { GENDER_LABELS, type Gender } from '@/lib/types';

/** Segmented m/w/d control – same look in onboarding and profile. */
export function GenderPicker({ value, onChange }: { value: Gender | null | ''; onChange: (g: Gender) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-paper p-1" role="radiogroup" aria-label="Geschlecht">
      {(Object.keys(GENDER_LABELS) as Gender[]).map(x => (
        <button type="button" key={x} role="radio" aria-checked={value === x} onClick={() => onChange(x)}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${value === x ? 'bg-white text-leaf-dark shadow-sm ring-2 ring-leaf' : 'text-ink-soft hover:bg-white/70 hover:text-ink'}`}>
          {GENDER_LABELS[x]}
        </button>
      ))}
    </div>
  );
}
