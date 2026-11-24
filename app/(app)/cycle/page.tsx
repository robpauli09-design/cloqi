import Link from 'next/link';
import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { PHASE_LABEL, summarize } from '@/lib/cycle';
import { hasCycleConsent, listCycleEntries } from '@/lib/repo';
import { addDays, daysBetween, formatDateDe, todayIn, WEEKDAYS_SHORT_DE, weekdayOf } from '@/lib/time';
import { Mascot } from '@/components/Mascot';
import { ProgressRing } from '@/components/ui';
import { CycleLog, DeleteEntry } from './CycleForms';
import { CycleSettings } from '../profile/ProfileForms';
import { cycleAvailable } from '@/lib/types';

export const metadata: Metadata = { title: 'Cycle' };

export default async function CyclePage() {
  const user = await requireReadyUser();
  if (!user.prefs.cycleEnabled || !await hasCycleConsent(user.id)) {
    // activate right here (explicit consent, Art. 9 GDPR) instead of sending people to the profile
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="card p-8 text-center">
          <Mascot name="clea" variant="bust" size={140} className="mx-auto w-fit" />
          <h1 className="h1 mt-4">Dein Periodenkalender</h1>
          <p className="muted mt-2">Cycle schätzt deine nächste Periode und zeigt sie dir – privat, verschlüsselt und nur in CLOQI. Es ist optional und erst nach deiner Einwilligung aktiv.</p>
        </div>
        {cycleAvailable(user)
          ? <CycleSettings enabled={false} inCalendar={false} />
          : <div className="card card-pad text-sm text-ink-soft">Cycle ist für dein Profil ausgeblendet. Du kannst dein Geschlecht im <Link href="/profile#profil" className="font-semibold text-leaf-dark">Profil</Link> ändern.</div>}
      </div>
    );
  }
  const today = todayIn(user.timezone);
  const entries = await listCycleEntries(user.id);
  const s = summarize(entries, today);
  const ovulation = s.lastStart ? addDays(s.lastStart, s.cycleLength - 14) : null;
  const start = addDays(today, 1 - weekdayOf(today));
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const kindOf = (d: string) => {
    if (!s.lastStart) return null;
    for (const base of [s.lastStart, s.nextStart!]) {
      const diff = daysBetween(base, d);
      if (diff >= 0 && diff < s.periodLength) return base === s.lastStart ? 'period' : 'predicted';
    }
    if (ovulation && Math.abs(daysBetween(ovulation, d)) <= 2) return 'fertile';
    if (s.nextStart) { const o2 = addDays(s.nextStart, s.cycleLength - 14); if (Math.abs(daysBetween(o2, d)) <= 2) return 'fertile'; }
    return null;
  };

  return (
    <div className="space-y-6">
      <header className="card relative overflow-hidden bg-gradient-to-br from-white to-[#FBE5EF] p-6 sm:p-8">
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="eyebrow !text-[#A33A69]">Cycle</p>
            <h1 className="h1">{s.phase ? PHASE_LABEL[s.phase] : 'Willkommen bei Cycle'}</h1>
            <p className="muted mt-2 max-w-lg">
              {s.nextStart
                ? `Deine nächste Periode beginnt voraussichtlich ${s.daysUntilNext === 0 ? 'heute' : s.daysUntilNext === 1 ? 'morgen' : `in ${s.daysUntilNext} Tagen`} (${formatDateDe(s.nextStart, { weekday: true })}).`
                : 'Trag den Beginn deiner letzten Periode ein – dann kann ich eine erste Schätzung machen.'}
            </p>
            <p className="mt-3 text-xs text-ink-faint">Schätzung aus {s.basedOnCycles} erfassten Zyklen · Ø Zyklus {s.cycleLength} Tage · Ø Periode {s.periodLength} Tage. Keine medizinische Beratung und nicht zur Verhütung geeignet.</p>
          </div>
          {s.dayOfCycle ? (
            <ProgressRing value={s.dayOfCycle / s.cycleLength} size={130} stroke={12}>
              <div><p className="font-display text-3xl font-semibold">{s.dayOfCycle}</p><p className="text-[11px] text-ink-faint">Zyklustag</p></div>
            </ProgressRing>
          ) : <Mascot name="clea" variant="bust" size={130} />}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <CycleLog today={today} />
        <section className="card card-pad">
          <h2 className="h2">Die nächsten Wochen</h2>
          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAYS_SHORT_DE.map(w => <span key={w} className="text-[10px] font-bold uppercase text-ink-faint">{w}</span>)}
            {days.map(d => {
              const k = kindOf(d);
              const cls = k === 'period' ? 'bg-[#E06A9E] text-white' : k === 'predicted' ? 'bg-[#FBE5EF] text-[#A33A69] ring-1 ring-[#E06A9E]/50' : k === 'fertile' ? 'bg-[#DDF3F1] text-[#13706A]' : 'bg-paper text-ink-soft';
              return <span key={d} className={`grid aspect-square place-items-center rounded-xl text-sm font-semibold ${cls} ${d === today ? 'outline outline-2 outline-ink' : ''}`}>{Number(d.slice(8))}</span>;
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#E06A9E]" /> Periode</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#FBE5EF] ring-1 ring-[#E06A9E]/50" /> Voraussichtlich</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#DDF3F1]" /> Fruchtbares Fenster (geschätzt)</span>
          </div>
          <h3 className="mt-6 text-sm font-bold">Letzte Einträge</h3>
          <ul className="mt-2 divide-y divide-line">
            {entries.slice(-10).reverse().map(e => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 font-semibold">{formatDateDe(e.date)}</span>
                <span className="min-w-0 flex-1 truncate text-ink-soft">
                  {e.type === 'period_start' ? 'Periode begonnen' : e.type === 'period_end' ? 'Periode beendet' : [
                    e.mood ? `Stimmung ${e.mood}/5` : null, e.energy ? `Energie ${e.energy}/5` : null, e.symptoms.join(', ') || null, e.note,
                  ].filter(Boolean).join(' · ')}
                </span>
                <DeleteEntry id={e.id} />
              </li>
            ))}
            {entries.length === 0 && <li className="py-2 text-sm text-ink-faint">Noch keine Einträge.</li>}
          </ul>
        </section>
      </div>
      <p className="text-center text-xs text-ink-faint">Deine Zyklusdaten sind verschlüsselt gespeichert, werden nie an Google, Apple, Outlook oder Werbepartner übertragen und lassen sich im Profil jederzeit vollständig löschen.</p>
    </div>
  );
}
