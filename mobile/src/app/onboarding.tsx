import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, errorText, type AppUser, type Gender, type MascotName } from '@/api';
import { useAuth } from '@/auth';
import { Mascot, mascotFor } from '@/components/Mascot';
import { Button, Card, ErrorBox, Input, Segmented, T } from '@/components/ui';
import { colors, font } from '@/theme';

const TYPES = [
  { value: 'schueler', label: 'Schüler/in' }, { value: 'student', label: 'Student/in' }, { value: 'lehrer', label: 'Lehrer/in' },
  { value: 'berufstaetig', label: 'Berufstätig' }, { value: 'sonstiges', label: 'Sonstiges' },
];

/** Short onboarding: name, gender (decides Cloki/Clea), what you do. Calendars are connected on the website for now. */
export default function Onboarding() {
  const { setUser } = useAuth();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [chosen, setChosen] = useState<MascotName>('cloki');
  const [type, setType] = useState('schueler');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mascot = mascotFor(gender, chosen);

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      setUser(await api<AppUser>('/me', { method: 'PATCH', body: { name: name.trim(), gender, mascot, userType: type, onboarded: true } }));
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.leafSoft }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <View style={st.hello}>
            <Mascot name={mascot} variant="bust" size={110} />
            <View style={st.bubble}><T style={{ fontFamily: font.medium }}>Hey! Schön, dass du da bist! Ich bin {mascot === 'clea' ? 'Clea' : 'Cloki'}.</T></View>
          </View>
          <Card style={{ gap: 16 }}>
            <T variant="h1">Wie dürfen wir dich nennen?</T>
            <Input value={name} onChangeText={setName} placeholder="Dein Vorname" maxLength={40} autoFocus accessibilityLabel="Vorname" />
            <View style={{ gap: 6 }}>
              <T variant="label">Geschlecht</T>
              <Segmented<Gender> value={gender} onChange={setGender} options={[{ value: 'm', label: 'Männlich' }, { value: 'w', label: 'Weiblich' }, { value: 'd', label: 'Divers' }]} />
            </View>
            {gender === 'd' && (
              <View style={{ gap: 6 }}>
                <T variant="label">Wer soll dich begleiten?</T>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['cloki', 'clea'] as const).map(m => (
                    <Pressable key={m} onPress={() => setChosen(m)} style={[st.choice, chosen === m && st.choiceOn]}>
                      <Mascot name={m} variant="head" size={40} />
                      <T style={{ fontFamily: font.semibold }}>{m === 'cloki' ? 'Cloki' : 'Clea'}</T>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <View style={{ gap: 8 }}>
              <T variant="label">Was machst du gerade?</T>
              <View style={st.types}>
                {TYPES.map(t => (
                  <Pressable key={t.value} onPress={() => setType(t.value)} style={[st.type, type === t.value && st.choiceOn]}>
                    <T style={{ fontFamily: font.semibold, color: type === t.value ? colors.leafDark : colors.ink }}>{t.label}</T>
                  </Pressable>
                ))}
              </View>
            </View>
            <ErrorBox text={error} />
            <Button title="Los geht’s" variant="lime" onPress={finish} loading={busy} disabled={!name.trim() || !gender} />
          </Card>
          <T variant="small" style={{ textAlign: 'center' }}>WebUntis und andere Kalender verbindest du im Profil auf der Website.</T>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  hello: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bubble: { flex: 1, marginBottom: 18, backgroundColor: colors.white, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14 },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white },
  choiceOn: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white },
});
