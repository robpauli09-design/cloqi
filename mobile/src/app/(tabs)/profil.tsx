import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { API_URL, api, errorText, type AppUser, type Gender, type MascotName } from '@/api';
import { useAuth } from '@/auth';
import { Mascot, mascotFor } from '@/components/Mascot';
import { Button, Card, ErrorBox, Input, Select, T } from '@/components/ui';
import { colors, font } from '@/theme';

const TYPES = [
  { value: 'schueler', label: 'Schüler/in' }, { value: 'student', label: 'Student/in' }, { value: 'lehrer', label: 'Lehrer/in' },
  { value: 'berufstaetig', label: 'Berufstätig' }, { value: 'sonstiges', label: 'Sonstiges' },
];
const GENDERS: { value: Gender; label: string }[] = [{ value: 'm', label: 'Männlich' }, { value: 'w', label: 'Weiblich' }, { value: 'd', label: 'Divers' }];

// Areas that are only on the website for now (opened in the browser).
const WEB = [
  { path: '/connect', label: 'Kalender verbinden', hint: 'WebUntis, Google, Apple, Outlook' },
  { path: '/vault', label: 'Wissen', hint: 'Was CLOQI über dich weiß' },
  { path: '/profile#lernzeiten', label: 'Lernzeiten & Fächer', hint: 'Wann CLOQI Lernblöcke planen darf' },
  { path: '/learn', label: 'Lernen', hint: 'Tests, Lernplan, Fortschritt' },
  { path: '/profile#konto', label: 'Datenschutz & Konto', hint: 'Daten exportieren, Account löschen' },
];

export default function Profil() {
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [type, setType] = useState(user?.userType ?? 'schueler');
  const [chosen, setChosen] = useState<MascotName>(user?.mascot ?? 'cloki');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user) return null;
  const mascot = mascotFor(gender, chosen);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      setUser(await api<AppUser>('/me', { method: 'PATCH', body: { name: name.trim(), gender, userType: type, mascot } }));
      setMsg({ ok: true, text: 'Profil gespeichert.' });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={st.header}>
          <Mascot name={user.mascot} variant="head" size={64} />
          <View style={{ flex: 1 }}>
            <T variant="eyebrow">Profil & Einstellungen</T>
            <T variant="h1" numberOfLines={1}>{user.name || 'Profil'}</T>
            <T variant="small" numberOfLines={1}>{user.email}</T>
          </View>
        </View>

        <Card style={{ gap: 14 }}>
          <T variant="h2">Profil</T>
          <Input label="Name" value={name} onChangeText={setName} maxLength={40} />
          <Select label="Benutzerart" value={type} options={TYPES} onChange={setType} />
          <Select<Gender> label="Geschlecht" value={gender} options={GENDERS} onChange={setGender} />
          <View style={{ gap: 6 }}>
            <T variant="label">Dein Begleiter</T>
            {gender === 'd' || !gender ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['cloki', 'clea'] as const).map(m => (
                  <Pressable key={m} onPress={() => setChosen(m)} style={[st.choice, mascot === m && st.choiceOn]}>
                    <Mascot name={m} variant="head" size={40} />
                    <T style={{ fontFamily: font.semibold }}>{m === 'cloki' ? 'Cloki' : 'Clea'}</T>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={[st.choice, st.choiceOn]}>
                <Mascot name={mascot} variant="head" size={40} />
                <View><T style={{ fontFamily: font.semibold }}>{mascot === 'clea' ? 'Clea' : 'Cloki'}</T><T variant="small">begleitet dich durch CLOQI</T></View>
              </View>
            )}
          </View>
          {msg && (msg.ok ? <T style={{ color: colors.leafDark, fontFamily: font.semibold }}>{msg.text}</T> : <ErrorBox text={msg.text} />)}
          <Button title="Speichern" onPress={save} loading={busy} disabled={!name.trim()} />
        </Card>

        <Card style={{ paddingVertical: 4, paddingHorizontal: 0 }}>
          {WEB.map((w, i) => (
            <Pressable key={w.path} onPress={() => Linking.openURL(`${API_URL}${w.path}`)}
              style={({ pressed }) => [st.link, i > 0 && st.linkBorder, pressed && { backgroundColor: colors.paper }]}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.semibold }}>{w.label}</T>
                <T variant="small">{w.hint}</T>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.leafDark} />
            </Pressable>
          ))}
        </Card>

        <Button title="Abmelden" variant="danger" onPress={() => Alert.alert('Abmelden?', undefined, [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Abmelden', style: 'destructive', onPress: () => { void signOut(); } },
        ])} />
        <T variant="small" style={{ textAlign: 'center' }}>CLOQI · Testversion</T>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white },
  choiceOn: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  linkBorder: { borderTopWidth: 1, borderTopColor: colors.line },
});
