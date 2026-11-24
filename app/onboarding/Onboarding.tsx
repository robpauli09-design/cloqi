'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Briefcase, CalendarDays, Dumbbell, GraduationCap, Heart, School, Sparkles, UserRound } from 'lucide-react';
import { completeOnboarding } from '@/app/actions/settings';
import { Mascot, type MascotName } from '@/components/Mascot';
import { mascotFor, type Gender } from '@/lib/types';
import { GenderPicker } from '@/components/GenderPicker';
import { Logo } from '@/components/Logo';
import { SubmitButton } from '@/components/ui';

const TYPES = [
  { value: 'schueler', label: 'Schüler/in', icon: School },
  { value: 'student', label: 'Student/in', icon: GraduationCap },
  { value: 'lehrer', label: 'Lehrer/in', icon: UserRound },
  { value: 'berufstaetig', label: 'Berufstätig', icon: Briefcase },
  { value: 'sonstiges', label: 'Sonstiges', icon: Sparkles },
];
const AREAS = [
  { value: 'schule', label: 'Schule / Universität', icon: School },
  { value: 'arbeit', label: 'Arbeit', icon: Briefcase },
  { value: 'training', label: 'Training', icon: Dumbbell },
  { value: 'privat', label: 'Private Termine', icon: Heart },
];
const TIMETABLE = [
  { value: 'webuntis', label: 'WebUntis verbinden', hint: 'Einfach den normalen WebUntis-Link einfügen' },
  { value: 'import', label: 'Anderen Stundenplan importieren', hint: 'ICS- oder CSV-Datei' },
  { value: 'manual', label: 'Stundenplan manuell erstellen', hint: 'Fach, Tag, Uhrzeit' },
];

const MESSAGES = [
  'Hey! Schön, dass du da bist!',
  'Was machst du gerade? Dann kann ich dich besser unterstützen.',
  'Wie sieht dein Alltag aus?',
  'Hast du einen Stundenplan? Wenn nicht, einfach überspringen.',
  'Nutzt du schon einen Kalender? Kein Problem, wenn nicht!',
  'Fertig! CLOQI übernimmt.',
];

export function Onboarding({ googleReady, outlookReady }: { googleReady: boolean; outlookReady: boolean }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState('schueler');
  const [areas, setAreas] = useState<string[]>(['schule', 'training', 'privat']);
  // nothing is preselected – many students don't use a calendar yet; both steps can be skipped
  const [timetable, setTimetable] = useState('');
  const [calendar, setCalendar] = useState('');
  const setup = timetable || (calendar ? 'kalender' : '');
  const [chosen, setMascot] = useState<MascotName>('cloki');
  const [gender, setGender] = useState<Gender | ''>('');
  const mascot = mascotFor(gender || null, chosen);
  const last = MESSAGES.length - 1;
  const message = step === 0 ? `${MESSAGES[0]} Ich bin ${mascot === 'clea' ? 'Clea' : 'Cloki'}.` : step === 1 && name ? `Hi ${name}! ${MESSAGES[1]}` : MESSAGES[step];

  return (
    <main className="min-h-dvh bg-gradient-to-b from-leaf-soft to-paper px-4 py-6 sm:py-10">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <Logo size="sm" />
        <span className="text-xs font-semibold text-ink-faint tabular">Schritt {step + 1} von {MESSAGES.length}</span>
      </div>
      <div className="mx-auto mt-3 h-2 max-w-2xl overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-leaf transition-all duration-500" style={{ width: `${((step + 1) / MESSAGES.length) * 100}%` }} />
      </div>

      <form action={completeOnboarding} className="mx-auto mt-8 max-w-2xl">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="userType" value={type} />
        {areas.map(a => <input key={a} type="hidden" name="areas" value={a} />)}
        <input type="hidden" name="setup" value={setup} />
        <input type="hidden" name="mascot" value={mascot} />
        <input type="hidden" name="gender" value={gender} />

        <Mascot name={mascot} variant="bust" size={step === last ? 170 : 120} message={message} className="mb-6" key={step} />

        <div className="card card-pad animate-rise" key={`s${step}`}>
          {step === 0 && (
            <>
              <h1 className="h1">Wie dürfen wir dich nennen?</h1>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={40} className="input mt-5 text-base" placeholder="Dein Vorname" aria-label="Vorname" />
              <p className="label mt-6">Geschlecht</p>
              <GenderPicker value={gender} onChange={setGender} />
              {gender === 'd' && <>
              <p className="label mt-6">Wer soll dich begleiten?</p>
              <div className="grid grid-cols-2 gap-3">
                {(['cloki', 'clea'] as const).map(m => (
                  <button type="button" key={m} onClick={() => setMascot(m)}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${mascot === m ? 'border-leaf bg-leaf-soft' : 'border-line hover:border-leaf/50'}`}>
                    <Mascot name={m} variant="head" size={44} />
                    <span className="font-semibold">{m === 'cloki' ? 'Cloki' : 'Clea'}</span>
                  </button>
                ))}
              </div>
              </>}
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="h1">Was machst du gerade?</h1>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {TYPES.map(t => (
                  <Choice key={t.value} active={type === t.value} onClick={() => setType(t.value)} icon={<t.icon size={20} />} label={t.label} />
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="h1">Wie sieht dein Alltag aus?</h1>
              <p className="muted mt-1">Wähle alles, was dazugehört.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {AREAS.map(a => (
                  <Choice key={a.value} active={areas.includes(a.value)} icon={<a.icon size={20} />} label={a.label}
                    onClick={() => setAreas(xs => xs.includes(a.value) ? xs.filter(x => x !== a.value) : [...xs, a.value])} />
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="h1">Verbinde deinen Stundenplan.</h1>
              <div className="mt-5 grid gap-3">
                {TIMETABLE.map(t => (
                  <Choice key={t.label} active={timetable === t.value} onClick={() => setTimetable(v => (v === t.value ? '' : t.value))} icon={<CalendarDays size={20} />} label={t.label} hint={t.hint} />
                ))}
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <h1 className="h1">Nutzt du schon einen Kalender?</h1>
              <p className="muted mt-1">Wenn nicht, überspring diesen Schritt einfach – CLOQI ist dann dein Kalender.</p>
              <div className="mt-5 grid gap-3">
                {[
                  { v: 'google', icon: <span className="font-bold text-info">G</span>, label: 'Google Kalender', hint: googleReady ? 'Nach dem Abschluss verbinden' : 'Auf diesem Server noch nicht eingerichtet' },
                  { v: 'apple', icon: <span className="font-bold text-ink">A</span>, label: 'Apple Kalender', hint: 'Abonnierbarer CLOQI-Kalender für iPhone, iPad & Mac' },
                  { v: 'outlook', icon: <span className="font-bold text-info">O</span>, label: 'Outlook', hint: outlookReady ? 'Nach dem Abschluss verbinden' : 'Auf diesem Server noch nicht eingerichtet' },
                ].map(c => <Choice key={c.v} active={calendar === c.v} onClick={() => setCalendar(v => (v === c.v ? '' : c.v))} icon={c.icon} label={c.label} hint={c.hint} />)}
                <p className="text-xs text-ink-faint">Alle Verbindungen findest du jederzeit unter „Kalender verbinden“.</p>
              </div>
            </>
          )}
          {step === 5 && (
            <div className="text-center">
              <h1 className="h1">Fertig! CLOQI übernimmt.</h1>
              <p className="muted mx-auto mt-2 max-w-md">Ich habe deinen Kalender vorbereitet. Schreib mir einfach, was ansteht – ich trage es ein und plane drumherum.{setup ? ' Das Verbinden zeige ich dir gleich auf deiner Startseite.' : ''}</p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="btn-ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft size={16} /> Zurück
            </button>
            {step === 3 || step === 4 ? (
              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost"
                  onClick={() => { if (step === 3) setTimetable(''); else setCalendar(''); setStep(s => s + 1); }}>
                  Überspringen
                </button>
                <button type="button" className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={step === 3 ? !timetable : !calendar}>
                  Weiter <ArrowRight size={16} />
                </button>
              </div>
            ) : step < last ? (
              <button type="button" className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={step === 0 && (!name.trim() || !gender)}>
                Weiter <ArrowRight size={16} />
              </button>
            ) : (
              <SubmitButton className="btn-lime px-6" pendingText="Wird eingerichtet …">Los geht’s</SubmitButton>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}

function Choice({ active, onClick, icon, label, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${active ? 'border-leaf bg-leaf-soft' : 'border-line bg-white hover:border-leaf/50'}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-leaf text-white' : 'bg-paper text-leaf-dark'}`}>{icon}</span>
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
    </button>
  );
}
