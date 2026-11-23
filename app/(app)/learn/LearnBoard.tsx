'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { CalendarCheck2, ChevronDown, Loader2, Plus, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import {
  addTaskAction, applyReplanAll, applyTaskPlan, deleteTaskAction, previewReplanAll, previewTaskPlan, setTaskDone, type PlanResult,
} from '@/app/actions/learn';
import type { PlanProposal } from '@/lib/planning';
import { formatDateDe, relativeDayDe, utcToZoned } from '@/lib/time';
import { TASK_KIND_LABELS, type StudyBlock, type Subject, type Task, type TaskKind } from '@/lib/types';
import { StudyCheck } from '@/components/ItemActions';
import { Mascot, type MascotName } from '@/components/Mascot';
import { toast, toastResult } from '@/components/Toaster';
import { FormMessage, SubmitButton } from '@/components/ui';

const DIFF = ['', 'Leicht', 'Mittel', 'Schwer'];

export function LearnBoard({ tasks, blocks, tz, today, subjects, mascot }: {
  tasks: Task[]; blocks: StudyBlock[]; tz: string; today: string; subjects: Subject[]; mascot: MascotName;
}) {
  const [showForm, setShowForm] = useState(tasks.length === 0);
  const [preview, setPreview] = useState<{ proposal: PlanProposal; taskId?: string } | null>(null);
  const [pending, start] = useTransition();
  const nowIso = new Date().toISOString();
  const open = tasks.filter(t => t.status === 'open' && t.dueAt > nowIso);
  const past = tasks.filter(t => !(t.status === 'open' && t.dueAt > nowIso));
  const fmt = (iso: string) => { const z = utcToZoned(iso, tz); return { day: relativeDayDe(z.date, today), time: z.time, date: z.date }; };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="h2 mr-auto">Anstehende Tests & Aufgaben</h2>
          <button className="btn-outline btn-sm" disabled={pending || open.length === 0} onClick={() => start(async () => {
            const r = await previewReplanAll();
            if (r.ok && r.proposal) setPreview({ proposal: r.proposal }); else toastResult(r);
          })}><RefreshCw size={14} /> Alles neu planen</button>
          <button className="btn-primary btn-sm" onClick={() => setShowForm(s => !s)}><Plus size={14} /> Test eintragen</button>
        </div>

        {showForm && <AddTaskForm subjects={subjects} onPlanned={(p, id) => { setPreview({ proposal: p, taskId: id }); setShowForm(false); }} />}

        {preview && (
          <PlanPreview proposal={preview.proposal} tz={tz} today={today} pending={pending}
            onApply={() => start(async () => {
              const r = preview.taskId ? await applyTaskPlan(preview.taskId) : await applyReplanAll();
              if (r.ok) toast(r.message ?? 'Lernplan gespeichert.', 'success', true); else toastResult(r);
              setPreview(null);
            })}
            onCancel={() => setPreview(null)} />
        )}

        {open.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-8 text-center">
            <Mascot name={mascot} variant="bust" size={120} />
            <p className="font-semibold">Keine anstehenden Tests.</p>
            <p className="muted">Sobald einer angekündigt wird: einfach eintragen oder mir sagen.</p>
          </div>
        ) : open.map(t => {
          const own = blocks.filter(b => b.taskId === t.id);
          const done = own.filter(b => b.status === 'done');
          const doneMin = done.reduce((s, b) => s + (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60000, 0);
          const plannedMin = own.filter(b => b.status !== 'missed').reduce((s, b) => s + (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60000, 0);
          const due = fmt(t.dueAt);
          return (
            <details key={t.id} className="card group" open={open.length <= 3}>
              <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-danger-soft text-center leading-none text-danger">
                  <span className="text-[10px] font-bold uppercase">{due.day === 'Heute' || due.day === 'Morgen' ? due.day : formatDateDe(due.date).split(' ')[1]?.slice(0, 3)}</span>
                  <span className="font-display text-lg font-semibold">{Number(due.date.slice(8))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.title}</p>
                  <p className="text-xs text-ink-soft">{due.day}, {due.time} Uhr · {DIFF[t.difficulty]} · {Math.round(doneMin)}/{t.estimatedMinutes} Min gelernt</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-leaf-soft"><div className="h-full rounded-full bg-leaf" style={{ width: `${Math.min(100, (doneMin / t.estimatedMinutes) * 100)}%` }} /></div>
                </div>
                <ChevronDown size={18} className="text-ink-faint transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-5 pb-5 pt-3">
                {own.length === 0 ? <p className="muted">Noch keine Lernblöcke geplant.</p> : (
                  <ul className="space-y-1.5">
                    {own.map(b => {
                      const s = fmt(b.startAt);
                      return (
                        <li key={b.id} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${b.status === 'missed' ? 'opacity-50' : ''}`}>
                          {b.status === 'missed' ? <span className="grid h-6 w-6 place-items-center text-xs text-danger">✕</span> : <StudyCheck id={b.id} done={b.status === 'done'} size="sm" />}
                          <span className="w-28 shrink-0 text-sm font-semibold">{s.day}</span>
                          <span className="text-sm tabular text-ink-soft">{s.time}–{fmt(b.endAt).time}</span>
                          <span className="chip bg-leaf-soft text-leaf-dark">{b.note ?? 'Lernen'}</span>
                          {b.status === 'missed' && <span className="text-xs text-danger">verpasst</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {plannedMin < t.estimatedMinutes && (
                    <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
                      const r: PlanResult = await previewTaskPlan(t.id);
                      if (r.ok && r.proposal) setPreview({ proposal: r.proposal, taskId: t.id }); else toastResult(r);
                    })}><CalendarCheck2 size={14} /> Lernzeit einplanen</button>
                  )}
                  <button className="btn-outline btn-sm" disabled={pending} onClick={() => start(async () => toastResult(await setTaskDone(t.id, true), true))}>Erledigt</button>
                  <button className="btn-danger btn-sm" disabled={pending} onClick={() => start(async () => toastResult(await deleteTaskAction(t.id)))}><Trash2 size={14} /> Löschen</button>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <aside className="space-y-4">
        <div className="card card-pad">
          <h2 className="h2">So plant CLOQI</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li>• Lernblöcke nur in deinen Lernzeiten (Profil → Lernpräferenzen)</li>
            <li>• Nie während Unterricht, Training oder anderen Terminen – mit Pause davor und danach</li>
            <li>• Mehrere Tests: der nächste und schwierigste zuerst, verteilt auf die Tage davor</li>
            <li>• Nie mehr als dein Tages-Maximum – Freizeit bleibt frei</li>
            <li>• Reicht die Zeit nicht, sage ich es dir, statt unrealistisch zu planen</li>
          </ul>
        </div>
        {past.length > 0 && (
          <div className="card card-pad">
            <h2 className="h2">Erledigt & vergangen</h2>
            <ul className="mt-3 space-y-2">
              {past.slice(-8).reverse().map(t => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{t.title} <span className="text-ink-faint">· {formatDateDe(utcToZoned(t.dueAt, tz).date)}</span></span>
                  {t.status === 'done' && t.dueAt > nowIso && (
                    <button className="btn-ghost btn-sm" onClick={() => start(async () => toastResult(await setTaskDone(t.id, false)))}><Undo2 size={13} /></button>
                  )}
                  <button aria-label="Löschen" className="btn-ghost btn-sm" onClick={() => start(async () => toastResult(await deleteTaskAction(t.id)))}><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function AddTaskForm({ subjects, onPlanned }: { subjects: Subject[]; onPlanned: (p: PlanProposal, taskId: string) => void }) {
  const [state, action] = useActionState(addTaskAction, null);
  const handled = useRef<PlanResult | null>(null);
  useEffect(() => {
    if (state && state !== handled.current && state.ok && state.proposal && state.taskId) {
      handled.current = state;
      onPlanned(state.proposal, state.taskId);
    }
  }, [state, onPlanned]);
  return (
    <form action={action} className="card card-pad animate-rise space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="t-subject">Fach</label>
          <input id="t-subject" name="subject" required maxLength={60} list="subject-list" className="input" placeholder="z. B. Mathematik" />
          <datalist id="subject-list">{subjects.map(s => <option key={s.name} value={s.name} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="t-kind">Art</label>
          <select id="t-kind" name="kind" className="input" defaultValue="test">
            {(Object.keys(TASK_KIND_LABELS) as TaskKind[]).map(k => <option key={k} value={k}>{TASK_KIND_LABELS[k]}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="t-date">Datum</label><input id="t-date" name="date" type="date" required className="input" /></div>
        <div><label className="label" htmlFor="t-time">Uhrzeit</label><input id="t-time" name="time" type="time" defaultValue="08:00" className="input" /></div>
        <div>
          <label className="label" htmlFor="t-diff">Schwierigkeit</label>
          <select id="t-diff" name="difficulty" defaultValue="2" className="input"><option value="1">Leicht</option><option value="2">Mittel</option><option value="3">Schwer</option></select>
        </div>
        <div>
          <label className="label" htmlFor="t-min">Lernaufwand in Minuten (optional)</label>
          <input id="t-min" name="minutes" type="number" min={15} max={1200} step={15} className="input" placeholder="CLOQI schätzt automatisch" />
        </div>
      </div>
      <div><label className="label" htmlFor="t-title">Stoff / Notiz (optional)</label><input id="t-title" name="title" maxLength={120} className="input" placeholder="z. B. Kapitel 4–5, quadratische Funktionen" /></div>
      <FormMessage state={state && !state.ok ? state : null} />
      <SubmitButton pendingText="Plane …"><CalendarCheck2 size={16} /> Eintragen & Lernplan vorschlagen</SubmitButton>
    </form>
  );
}

function PlanPreview({ proposal, tz, today, pending, onApply, onCancel }: {
  proposal: PlanProposal; tz: string; today: string; pending: boolean; onApply: () => void; onCancel: () => void;
}) {
  const total = proposal.blocks.reduce((s, b) => s + b.minutes, 0);
  return (
    <div className="card animate-pop border-2 border-leaf/40 p-5">
      <p className="eyebrow !text-leaf-dark">Vorschlag von CLOQI</p>
      <h3 className="h2 mt-1">{proposal.blocks.length ? `${proposal.blocks.length} Lernblöcke · ${total} Minuten` : 'Kein freier Zeitraum gefunden'}</h3>
      {proposal.blocks.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {proposal.blocks.map(b => {
            const s = utcToZoned(b.startAt, tz);
            return (
              <li key={b.startAt + b.taskId} className="flex items-center gap-3 rounded-xl bg-leaf-soft/60 px-3 py-2 text-sm">
                <span className="w-28 shrink-0 font-semibold">{relativeDayDe(s.date, today)}</span>
                <span className="tabular text-ink-soft">{s.time}–{utcToZoned(b.endAt, tz).time}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{b.subject}: {b.label}</span>
                <span className="text-xs text-ink-faint">{b.minutes} Min</span>
              </li>
            );
          })}
        </ul>
      )}
      {proposal.shortfalls.length > 0 && (
        <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-[#8a4a0e]">
          Ehrlich gesagt: Für {proposal.shortfalls.map(s => `${s.taskTitle} (${s.missingMinutes} Min)`).join(', ')} finde ich keinen freien Platz mehr.
          Du kannst unter Profil → Lernpräferenzen mehr Lernzeit erlauben.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        {proposal.blocks.length > 0 && <button className="btn-primary" disabled={pending} onClick={onApply}>{pending && <Loader2 size={15} className="animate-spin" />} Lernplan übernehmen</button>}
        <button className="btn-ghost" onClick={onCancel}>{proposal.blocks.length ? 'Nicht jetzt' : 'Schließen'}</button>
      </div>
    </div>
  );
}
