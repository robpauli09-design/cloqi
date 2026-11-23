'use client';

import { useActionState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { logCycle, removeCycleEntry } from '@/app/actions/settings';
import { toastResult } from '@/components/Toaster';
import { FormMessage, SubmitButton } from '@/components/ui';

const SYMPTOMS = ['Krämpfe', 'Kopfschmerzen', 'Müdigkeit', 'Rückenschmerzen', 'Hautunreinheiten', 'Heißhunger', 'Übelkeit', 'Brustspannen'];
const SCALE = ['😣', '🙁', '😐', '🙂', '😄'];

export function CycleLog({ today }: { today: string }) {
  const [state, action] = useActionState(logCycle, null);
  return (
    <section className="card card-pad space-y-5">
      <h2 className="h2">Eintragen</h2>
      <form action={action} className="grid grid-cols-2 gap-2" key={`quick-${state?.ok ? state.message : ''}`}>
        <input type="hidden" name="date" value={today} />
        <button name="type" value="period_start" className="btn rounded-2xl bg-[#E06A9E] py-4 text-white hover:opacity-90">Periode beginnt heute</button>
        <button name="type" value="period_end" className="btn rounded-2xl bg-[#FBE5EF] py-4 text-[#A33A69] hover:bg-[#f6d3e2]">Periode endet heute</button>
      </form>
      <form action={action} className="space-y-4 border-t border-line pt-4" key={`log-${state?.ok ? state.message : ''}`}>
        <input type="hidden" name="type" value="log" />
        <div><label className="label" htmlFor="c-date">Datum</label><input id="c-date" name="date" type="date" defaultValue={today} className="input" /></div>
        {(['mood', 'energy'] as const).map(k => (
          <fieldset key={k}>
            <legend className="label">{k === 'mood' ? 'Stimmung' : 'Energielevel'}</legend>
            <div className="flex gap-2">
              {SCALE.map((emo, i) => (
                <label key={i} className="cursor-pointer">
                  <input type="radio" name={k} value={i + 1} className="peer sr-only" />
                  <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-line text-xl peer-checked:border-[#E06A9E] peer-checked:bg-[#FBE5EF] peer-focus-visible:ring-2">{k === 'mood' ? emo : i + 1}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="label">Symptome</legend>
          <div className="flex flex-wrap gap-1.5">
            {SYMPTOMS.map(s => (
              <label key={s} className="cursor-pointer">
                <input type="checkbox" name="symptoms" value={s} className="peer sr-only" />
                <span className="chip border border-line bg-white px-3 py-1.5 text-sm text-ink-soft peer-checked:border-transparent peer-checked:bg-[#FBE5EF] peer-checked:text-[#A33A69]">{s}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div><label className="label" htmlFor="c-note">Notiz</label><input id="c-note" name="note" maxLength={300} className="input" /></div>
        <FormMessage state={state} />
        <SubmitButton>Speichern</SubmitButton>
      </form>
    </section>
  );
}

export function DeleteEntry({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button aria-label="Eintrag löschen" disabled={pending} className="btn-ghost btn-sm text-ink-faint hover:text-danger" onClick={() => start(async () => toastResult(await removeCycleEntry(id)))}>
      <Trash2 size={14} />
    </button>
  );
}
