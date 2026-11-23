'use client';

import { useActionState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { addRoutineAction, deleteEventAction } from '@/app/actions/calendar';
import { WEEKDAYS_SHORT_DE } from '@/lib/time';
import { toastResult } from '@/components/Toaster';
import { FormMessage, SubmitButton } from '@/components/ui';
import { Select } from '@/components/Select';

const PRESETS = [
  { title: 'Training', category: 'training', start: '17:00', end: '18:30' },
  { title: 'Arbeit', category: 'arbeit', start: '16:00', end: '20:00' },
  { title: 'Freunde', category: 'freizeit', start: '18:00', end: '21:00' },
  { title: 'Musikschule', category: 'privat', start: '15:00', end: '16:00' },
];

export function LifeForms() {
  const [state, action] = useActionState(addRoutineAction, null);
  return (
    <form action={action} className="card card-pad space-y-4" key={state?.ok ? state.message : 'form'}>
      <h2 className="h2">Routine eintragen</h2>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button key={p.title} type="button" className="chip bg-paper px-3 py-1.5 text-sm text-ink-soft hover:bg-leaf-soft hover:text-leaf-dark"
            onClick={e => {
              const f = (e.currentTarget.closest('form') as HTMLFormElement).elements as unknown as Record<string, HTMLInputElement>;
              f.title.value = p.title; f.category.value = p.category; f.start.value = p.start; f.end.value = p.end;
            }}>{p.title}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="r-title">Was?</label><input id="r-title" name="title" required maxLength={80} className="input" placeholder="z. B. Fußballtraining" /></div>
        <div>
          <label className="label" htmlFor="r-cat">Kategorie</label>
          <Select id="r-cat" name="category" defaultValue="training" className="input">
            <option value="training">Training</option><option value="arbeit">Arbeit</option><option value="freizeit">Freizeit</option><option value="privat">Privat</option>
          </Select>
        </div>
      </div>
      <fieldset>
        <legend className="label">An welchen Tagen?</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS_SHORT_DE.map((w, i) => (
            <label key={w} className="cursor-pointer">
              <input type="checkbox" name="weekday" value={i + 1} className="peer sr-only" />
              <span className="grid h-10 w-11 place-items-center rounded-xl border-2 border-line text-sm font-semibold peer-checked:border-leaf peer-checked:bg-leaf-soft peer-checked:text-leaf-dark peer-focus-visible:ring-2 peer-focus-visible:ring-leaf">{w}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><label className="label" htmlFor="r-start">Beginn</label><input id="r-start" name="start" type="time" required defaultValue="17:00" className="input" /></div>
        <div><label className="label" htmlFor="r-end">Ende</label><input id="r-end" name="end" type="time" required defaultValue="18:30" className="input" /></div>
        <div className="col-span-2"><label className="label" htmlFor="r-until">Bis (optional)</label><input id="r-until" name="until" type="date" className="input" /></div>
      </div>
      <div><label className="label" htmlFor="r-loc">Ort (optional)</label><input id="r-loc" name="location" maxLength={200} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Speichern …">Routine speichern</SubmitButton>
    </form>
  );
}

export function RoutineDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button aria-label="Routine löschen" disabled={pending} className="btn-ghost btn-sm text-ink-faint hover:text-danger"
      onClick={() => { if (window.confirm('Diese Routine (alle Termine der Serie) löschen?')) start(async () => toastResult(await deleteEventAction(id, 'series'))); }}>
      <Trash2 size={15} />
    </button>
  );
}
