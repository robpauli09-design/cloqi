import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorText } from '@/api';
import { addDays, dayNum, relativeDay, weekday, WEEKDAYS_SHORT } from '@/dates';
import { Button, ErrorBox, Input, Select, T } from '@/components/ui';
import { categoryLabel, colors, font, radius } from '@/theme';

const CATEGORIES = Object.entries(categoryLabel).map(([value, label]) => ({ value, label }));
const REMINDERS = [
  { value: 'none', label: 'Keine' }, { value: '5', label: '5 Minuten vorher' }, { value: '15', label: '15 Minuten vorher' },
  { value: '30', label: '30 Minuten vorher' }, { value: '60', label: '1 Stunde vorher' }, { value: '1440', label: '1 Tag vorher' },
];
const REPEATS = [
  { value: 'none', label: 'Einmalig' }, { value: 'daily', label: 'Täglich' }, { value: 'weekly', label: 'Wöchentlich' },
  { value: 'biweekly', label: 'Alle zwei Wochen' }, { value: 'monthly', label: 'Monatlich' }, { value: 'yearly', label: 'Jährlich' },
];

/** "14", "1430", "14.30" → "14:30" */
const normTime = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d.length ? `${d.padStart(2, '0')}:00` : '';
  return `${d.slice(0, -2).padStart(2, '0')}:${d.slice(-2)}`;
};
const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * New event, or edit an existing one (?id=…&occ=…&scope=single|series).
 * Prefill from the day view: ?date=YYYY-MM-DD&start=HH:MM.
 */
export default function NeuerTermin() {
  const router = useRouter();
  const p = useLocalSearchParams<{ id?: string; occ?: string; scope?: string; date?: string; start?: string }>();
  const editing = Boolean(p.id);
  const [loaded, setLoaded] = useState(!p.id); // edit mode: form appears once the event is loaded
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  // prefilled from a tap in the day view: one hour from the tapped time
  const [start, setStart] = useState(p.start && !p.id ? p.start : '16:00');
  const [end, setEnd] = useState(() => {
    if (!p.start || p.id) return '17:00';
    const [h, m] = p.start.split(':').map(Number);
    return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [category, setCategory] = useState('privat');
  const [reminder, setReminder] = useState('15');
  const [repeat, setRepeat] = useState('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ from: string }>('/calendar?days=1').then(r => { setToday(r.from); if (!p.id) setDate(p.date || r.from); }).catch(e => setError(errorText(e)));
    if (p.id) {
      api<{ title: string; date: string; start: string; end: string; category: string; location: string | null; reminderMinutes: number | null; repeat: string; repeatDays?: number[] }>(
        `/events/${encodeURIComponent(p.id)}${p.occ ? `?occ=${p.occ}` : ''}`,
      ).then(d => {
        setTitle(d.title); setDate(d.date); setStart(d.start); setEnd(d.end); setCategory(d.category);
        setLocation(d.location ?? ''); setReminder(d.reminderMinutes === null ? 'none' : String(d.reminderMinutes));
        setRepeat(p.scope === 'single' ? 'none' : d.repeat === 'custom' ? 'weekly' : d.repeat);
        setRepeatDays(d.repeatDays ?? []);
        setLoaded(true);
      }).catch(e => setError(errorText(e)));
    }
  }, [p.id, p.occ, p.scope, p.date, p.start]);

  const save = async () => {
    setError(null);
    if (!validTime(start) || !validTime(end)) return setError('Bitte Uhrzeiten wie 16:00 eingeben.');
    if (end <= start) return setError('Das Ende muss nach dem Beginn liegen.');
    setBusy(true);
    try {
      const fields = { title: title.trim(), date, start, end, category, reminder, repeat, repeatDays: ['weekly', 'biweekly'].includes(repeat) ? repeatDays : [], location: location.trim() || undefined };
      if (editing) await api(`/events/${encodeURIComponent(p.id!)}`, { method: 'PATCH', body: { ...fields, scope: p.scope === 'single' ? 'single' : 'series', occurrenceDate: p.occ ?? null } });
      else await api('/events', { method: 'POST', body: fields });
      router.back();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={st.head}>
          <T variant="h1">{editing ? 'Termin bearbeiten' : 'Neuer Termin'}</T>
          <Pressable onPress={() => router.back()} hitSlop={12}><T style={{ color: colors.inkSoft, fontFamily: font.semibold }}>Abbrechen</T></Pressable>
        </View>
        {!loaded && (error ? <ErrorBox text={error} /> : <ActivityIndicator color={colors.leaf} style={{ marginVertical: 40 }} />)}
        {loaded && <>
        <Input label="Titel" value={title} onChangeText={setTitle} placeholder="z. B. Training, Arzt, Mathe lernen" maxLength={120} autoFocus={!editing} />

        <View style={{ gap: 6 }}>
          <T variant="label">Tag</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {today && [...new Set([...(date && date < today ? [date] : []), ...Array.from({ length: 28 }, (_, i) => addDays(today, i)), ...(date && date > addDays(today, 27) ? [date] : [])])].map(d => {
              const on = d === date;
              return (
                <Pressable key={d} onPress={() => setDate(d)} style={[st.day, on && st.dayOn]}>
                  <T variant="small" style={on ? { color: 'rgba(255,255,255,0.85)' } : undefined}>{i18nDay(d, today)}</T>
                  <T style={[st.dayNum, on && { color: colors.white }]}>{dayNum(d)}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          {date && today && <T variant="small">{relativeDay(date, today)}</T>}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Input label="Beginn" value={start} onChangeText={setStart} onBlur={() => setStart(normTime(start))} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
          <View style={{ flex: 1 }}><Input label="Ende" value={end} onChangeText={setEnd} onBlur={() => setEnd(normTime(end))} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
        </View>
        <Select label="Kategorie" value={category} options={CATEGORIES} onChange={setCategory} />
        <Select label="Erinnerung" value={reminder} options={REMINDERS} onChange={setReminder} />
        <Select label="Wiederholung" value={repeat} options={REPEATS} onChange={setRepeat} />
        {['weekly', 'biweekly'].includes(repeat) && (
          <View style={{ gap: 6 }}>
            <T variant="label">An diesen Tagen (optional, z. B. Training Mo + Mi)</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {WEEKDAYS_SHORT.map((l, i) => {
                const on = repeatDays.includes(i + 1) || (!!date && weekday(date) === i + 1);
                return (
                  <Pressable key={l} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    onPress={() => setRepeatDays(ds => (ds.includes(i + 1) ? ds.filter(x => x !== i + 1) : [...ds, i + 1]))}
                    style={[st.wd, on && st.wdOn]}>
                    <T style={{ fontFamily: font.semibold, color: on ? colors.leafDark : colors.inkSoft }}>{l}</T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <Input label="Ort (optional)" value={location} onChangeText={setLocation} maxLength={200} />
        <ErrorBox text={error} />
        <Button title={editing ? 'Speichern' : 'Termin erstellen'} onPress={save} loading={busy} disabled={!title.trim() || !date} />
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const i18nDay = (d: string, today: string) => (d === today ? 'Heute' : WEEKDAYS_SHORT[weekday(d) - 1]);

const st = StyleSheet.create({
  wd: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  wdOn: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  day: { width: 54, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, gap: 2 },
  dayOn: { backgroundColor: colors.leafDark, borderColor: colors.leafDark },
  dayNum: { fontFamily: font.bold, fontSize: 17 },
});
