'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, Download, LogOut, ShieldCheck, Trash2, X } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { addSubject, deleteAccount, removeSubject, saveProfile, savePrefs, setCycleInCalendar, setCycleModule } from '@/app/actions/settings';
import { GENDER_LABELS, mascotFor, USER_TYPE_LABELS, type Gender, type Prefs, type Subject, type UserType } from '@/lib/types';
import { Mascot, type MascotName } from '@/components/Mascot';
import { toastResult } from '@/components/Toaster';
import { FormMessage, SubmitButton, Toggle } from '@/components/ui';
import { Select } from '@/components/Select';

const ZONES = ['Europe/Vienna', 'Europe/Berlin', 'Europe/Zurich', 'Europe/Rome', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Europe/Warsaw', 'America/New_York', 'Asia/Tokyo'];

export function ProfileForm({ name, userType, gender, timezone, mascot }: { name: string; userType: UserType | null; gender: Gender | null; timezone: string; mascot: MascotName }) {
  const [state, action] = useActionState(saveProfile, null);
  const [m, setM] = useState(mascot);
  const [g, setG] = useState<Gender | null>(gender);
  const shown = mascotFor(g, m);
  return (
    <form action={action} className="card card-pad space-y-4">
      <h2 className="h2">Profil</h2>
      <div><label className="label" htmlFor="p-name">Name</label><input id="p-name" name="name" required maxLength={40} defaultValue={name} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="p-type">Benutzerart</label>
          <Select id="p-type" name="userType" defaultValue={userType ?? 'sonstiges'} className="input">
            {(Object.keys(USER_TYPE_LABELS) as UserType[]).map(t => <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>)}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="p-gender">Geschlecht</label>
          <Select id="p-gender" name="gender" value={g ?? ''} onChange={e => setG(e.target.value as Gender)}>
            <option value="" disabled>Bitte wählen</option>
            {(Object.keys(GENDER_LABELS) as Gender[]).map(x => <option key={x} value={x}>{GENDER_LABELS[x]}</option>)}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="p-tz">Zeitzone</label>
          <Select id="p-tz" name="timezone" defaultValue={timezone} className="input">
            {[...new Set([timezone, ...ZONES])].map(z => <option key={z} value={z}>{z}</option>)}
          </Select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Dein Begleiter</legend>
        <input type="hidden" name="mascot" value={shown} />
        {g === 'd' || !g ? (
          <div className="grid grid-cols-2 gap-3">
            {(['cloki', 'clea'] as const).map(x => (
              <button key={x} type="button" onClick={() => setM(x)} aria-pressed={shown === x}
                className={`flex items-center gap-3 rounded-2xl border-2 p-3 transition ${shown === x ? 'border-leaf bg-leaf-soft' : 'border-line hover:border-leaf/50'}`}>
                <Mascot name={x} variant="head" size={44} /><span className="font-semibold">{x === 'cloki' ? 'Cloki' : 'Clea'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-leaf bg-leaf-soft p-3">
            <Mascot name={shown} variant="head" size={44} />
            <span><span className="block font-semibold">{shown === 'clea' ? 'Clea' : 'Cloki'}</span><span className="block text-xs text-ink-soft">begleitet dich durch CLOQI</span></span>
          </div>
        )}
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton>Speichern</SubmitButton>
    </form>
  );
}

export function PrefsForm({ prefs }: { prefs: Prefs }) {
  const [state, action] = useActionState(savePrefs, null);
  return (
    <form action={action} className="card card-pad space-y-4">
      <h2 className="h2">Lernpräferenzen</h2>
      <p className="muted -mt-2">CLOQI plant Lernblöcke nur innerhalb dieser Zeiten.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="pr-ss">Mo–Fr ab</label><input id="pr-ss" name="studyStart" type="time" defaultValue={prefs.studyStart} className="input" /></div>
        <div><label className="label" htmlFor="pr-se">Mo–Fr bis</label><input id="pr-se" name="studyEnd" type="time" defaultValue={prefs.studyEnd} className="input" /></div>
        <div><label className="label" htmlFor="pr-ws">Wochenende ab</label><input id="pr-ws" name="weekendStart" type="time" defaultValue={prefs.weekendStart} className="input" /></div>
        <div><label className="label" htmlFor="pr-we">Wochenende bis</label><input id="pr-we" name="weekendEnd" type="time" defaultValue={prefs.weekendEnd} className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="studyOnSunday" defaultChecked={prefs.studyOnSunday} className="h-4 w-4 accent-[#7CC51B]" /> Auch am Sonntag lernen</label>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="pr-max">Max. Lernzeit pro Tag (Min)</label><input id="pr-max" name="maxStudyPerDay" type="number" min={30} max={480} step={15} defaultValue={prefs.maxStudyPerDay} className="input" /></div>
        <div><label className="label" htmlFor="pr-block">Max. Länge eines Blocks (Min)</label><input id="pr-block" name="blockMax" type="number" min={15} max={180} step={15} defaultValue={prefs.blockMax} className="input" /></div>
        <div><label className="label" htmlFor="pr-break">Pause vor/nach Terminen (Min)</label><input id="pr-break" name="breakMin" type="number" min={0} max={60} step={5} defaultValue={prefs.breakMin} className="input" /></div>
        <div><label className="label" htmlFor="pr-goal">Tagesziel Lernzeit (Min)</label><input id="pr-goal" name="dailyGoalMin" type="number" min={0} max={480} step={5} defaultValue={prefs.dailyGoalMin} className="input" /></div>
        <div className="col-span-2"><label className="label" htmlFor="pr-rem">Standard-Erinnerung (Minuten vorher)</label><input id="pr-rem" name="reminderDefault" type="number" min={0} max={1440} defaultValue={prefs.reminderDefault} className="input" /></div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Speichern</SubmitButton>
    </form>
  );
}

export function SubjectsForm({ subjects }: { subjects: Subject[] }) {
  const [state, action] = useActionState(addSubject, null);
  const [pending, start] = useTransition();
  return (
    <section className="card card-pad space-y-4">
      <h2 className="h2">Fächer</h2>
      <p className="muted -mt-2">Die Schwierigkeit bestimmt, wie viel Lernzeit CLOQI für Tests einplant.</p>
      <div className="flex flex-wrap gap-2">
        {subjects.length === 0 && <span className="text-sm text-ink-faint">Noch keine Fächer.</span>}
        {subjects.map(s => (
          <span key={s.name} className="chip bg-leaf-soft py-1.5 pl-3 text-leaf-dark">
            {s.name} · {['', 'leicht', 'mittel', 'schwer'][s.difficulty]}
            <button aria-label={`${s.name} entfernen`} disabled={pending} onClick={() => start(async () => toastResult(await removeSubject(s.name)))} className="rounded-full p-0.5 hover:bg-white"><X size={12} /></button>
          </span>
        ))}
      </div>
      <form action={action} className="flex flex-wrap gap-2" key={state?.ok ? state.message : 'subj'}>
        <input name="subject" required maxLength={40} placeholder="Fach" className="input w-40 flex-1" aria-label="Fach" />
        <Select name="difficulty" defaultValue="2" className="input w-32" aria-label="Schwierigkeit"><option value="1">Leicht</option><option value="2">Mittel</option><option value="3">Schwer</option></Select>
        <SubmitButton className="btn-outline">Hinzufügen</SubmitButton>
      </form>
      <FormMessage state={state && !state.ok ? state : null} />
    </section>
  );
}

export function NotificationSettings() {
  const [perm, setPerm] = useState<string>('default');
  useEffect(() => { setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);
  return (
    <section className="card card-pad space-y-3">
      <h2 className="h2">Erinnerungen</h2>
      <p className="muted">Solange CLOQI geöffnet ist, erinnert dich Cloki in der App. Mit Browser-Benachrichtigungen bekommst du sie auch, wenn der Tab im Hintergrund ist. Push-Nachrichten bei geschlossener App kommen mit den Handy-Apps.</p>
      {perm === 'granted' ? <p className="chip bg-leaf-soft text-leaf-dark"><Bell size={13} /> Browser-Benachrichtigungen aktiv</p>
        : perm === 'unsupported' ? <p className="text-sm text-ink-faint">Dieser Browser unterstützt keine Benachrichtigungen.</p>
        : perm === 'denied' ? <p className="text-sm text-ink-faint">Benachrichtigungen sind im Browser blockiert. Du kannst sie in den Website-Einstellungen erlauben.</p>
        : <button className="btn-outline" onClick={() => Notification.requestPermission().then(setPerm)}><Bell size={15} /> Browser-Benachrichtigungen erlauben</button>}
    </section>
  );
}

export function CycleSettings({ enabled, inCalendar }: { enabled: boolean; inCalendar: boolean }) {
  const [pending, start] = useTransition();
  const [consent, setConsent] = useState(false);
  return (
    <section className="card card-pad space-y-3">
      <div className="flex items-center gap-3">
        <Mascot name="clea" variant="head" size={44} />
        <h2 className="h2 flex-1">Cycle (optional)</h2>
        {enabled && <span className="chip bg-[#FBE5EF] text-[#A33A69]">Aktiv</span>}
      </div>
      <p className="muted">Ein optionaler Zyklus-Tracker. Er ist standardmäßig aus und ändert nichts an CLOQI für alle anderen.</p>
      {!enabled ? (
        <>
          <label className="flex gap-2 rounded-xl bg-paper p-3 text-sm">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E06A9E]" />
            <span>Ich willige ein, dass CLOQI meine Zyklusdaten (Gesundheitsdaten nach Art. 9 DSGVO) verschlüsselt speichert, um mir Schätzungen anzuzeigen.
              Die Daten werden nie an Werbepartner oder externe Kalender weitergegeben. Ich kann die Einwilligung jederzeit widerrufen – dann werden alle Zyklusdaten gelöscht.</span>
          </label>
          <button className="btn-primary" disabled={!consent || pending} onClick={() => start(async () => toastResult(await setCycleModule(true, consent)))}>Cycle aktivieren</button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-paper p-3 text-sm">
            <span>Geschätzte Periode im CLOQI-Kalender anzeigen (nur in CLOQI, nie exportiert)</span>
            <Toggle on={inCalendar} label="Im Kalender anzeigen" disabled={pending} onChange={v => start(async () => toastResult(await setCycleInCalendar(v)))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/cycle" className="btn-outline">Cycle öffnen</Link>
            <button className="btn-danger" disabled={pending} onClick={() => {
              if (window.confirm('Cycle deaktivieren und alle Zyklusdaten endgültig löschen?')) start(async () => toastResult(await setCycleModule(false, false)));
            }}>Deaktivieren & Daten löschen</button>
          </div>
        </>
      )}
    </section>
  );
}

export function DangerZone() {
  const [state, action] = useActionState(deleteAccount, null);
  return (
    <section className="card card-pad space-y-4">
      <h2 className="h2 flex items-center gap-2"><ShieldCheck size={20} className="text-leaf" /> Datenschutz & Account</h2>
      <ul className="space-y-1 text-sm text-ink-soft">
        <li>• Daten werden in der EU gespeichert, Tokens und Feed-Links verschlüsselt (AES-256).</li>
        <li>• Kalenderverbindungen nur nach deiner Freigabe – jederzeit trennbar.</li>
        <li>• Keine Weitergabe an Werbepartner.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <a href="/api/export" className="btn-outline"><Download size={15} /> Meine Daten exportieren (JSON)</a>
        <form action={logout}><button className="btn-outline"><LogOut size={15} /> Abmelden</button></form>
      </div>
      <details className="rounded-xl border border-danger/30 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-danger">Account löschen</summary>
        <form action={action} className="mt-3 space-y-2">
          <p className="text-sm text-ink-soft">Löscht deinen Account und alle Daten sofort und endgültig. Verbindungen zu Google/Outlook werden widerrufen.</p>
          <input name="confirm" placeholder="Tippe LÖSCHEN" className="input" aria-label="Bestätigung" />
          <FormMessage state={state} />
          <SubmitButton className="btn btn-danger border border-danger/40"><Trash2 size={15} /> Endgültig löschen</SubmitButton>
        </form>
      </details>
    </section>
  );
}

