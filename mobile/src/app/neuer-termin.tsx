import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
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

export default function NeuerTermin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('17:00');
  const [category, setCategory] = useState('privat');
  const [reminder, setReminder] = useState('15');
  const [repeat, setRepeat] = useState('none');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ from: string }>('/calendar?days=1').then(r => { setToday(r.from); setDate(r.from); }).catch(e => setError(errorText(e)));
  }, []);

  const save = async () => {
    setError(null);
    if (!validTime(start) || !validTime(end)) return setError('Bitte Uhrzeiten wie 16:00 eingeben.');
    if (end <= start) return setError('Das Ende muss nach dem Beginn liegen.');
    setBusy(true);
    try {
      await api('/events', { method: 'POST', body: { title: title.trim(), date, start, end, category, reminder, repeat, location: location.trim() || undefined } });
      router.back();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={st.head}>
          <T variant="h1">Neuer Termin</T>
          <Pressable onPress={() => router.back()} hitSlop={12}><T style={{ color: colors.inkSoft, fontFamily: font.semibold }}>Abbrechen</T></Pressable>
        </View>
        <Input label="Titel" value={title} onChangeText={setTitle} placeholder="z. B. Training, Arzt, Mathe lernen" maxLength={120} autoFocus />

        <View style={{ gap: 6 }}>
          <T variant="label">Tag</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {today && Array.from({ length: 21 }, (_, i) => addDays(today, i)).map(d => {
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
        <Input label="Ort (optional)" value={location} onChangeText={setLocation} maxLength={200} />
        <ErrorBox text={error} />
        <Button title="Termin erstellen" onPress={save} loading={busy} disabled={!title.trim() || !date} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const i18nDay = (d: string, today: string) => (d === today ? 'Heute' : WEEKDAYS_SHORT[weekday(d) - 1]);

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  day: { width: 54, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, gap: 2 },
  dayOn: { backgroundColor: colors.leafDark, borderColor: colors.leafDark },
  dayNum: { fontFamily: font.bold, fontSize: 17 },
});
