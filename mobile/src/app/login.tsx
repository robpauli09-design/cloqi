import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorText } from '@/api';
import { useAuth } from '@/auth';
import { Mascot } from '@/components/Mascot';
import { Button, Card, ErrorBox, Input, Segmented, T } from '@/components/ui';
import { colors, font } from '@/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (mode === 'register' && password.length < 8) return setError('Das Passwort braucht mindestens 8 Zeichen.');
    setBusy(true);
    try { await signIn(mode, email.trim(), password); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.leafSoft }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Mascot name="cloki" variant="bust" size={150} />
            <T style={st.logo}>CLOQI</T>
            <T variant="muted">Your day. Your flow.</T>
          </View>
          <Card style={{ gap: 14 }}>
            <Segmented<'login' | 'register'> value={mode} onChange={m => { setMode(m); setError(null); }}
              options={[{ value: 'login', label: 'Anmelden' }, { value: 'register', label: 'Account erstellen' }]} />
            <Input label="E-Mail-Adresse" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="du@beispiel.at" />
            <Input label="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              textContentType={mode === 'login' ? 'password' : 'newPassword'} placeholder={mode === 'register' ? 'mindestens 8 Zeichen' : ''} onSubmitEditing={submit} returnKeyType="go" />
            <ErrorBox text={error} />
            <Button title={mode === 'login' ? 'Anmelden' : 'Account erstellen'} onPress={submit} loading={busy} disabled={!email || !password} />
          </Card>
          <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')} style={{ alignSelf: 'center', padding: 8 }}>
            <T variant="muted">{mode === 'login' ? 'Neu hier? ' : 'Schon dabei? '}<T style={{ fontFamily: font.bold, color: colors.leafDark }}>{mode === 'login' ? 'Account erstellen' : 'Anmelden'}</T></T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 20 },
  logo: { fontFamily: font.display, fontSize: 34, lineHeight: 40, color: colors.leafDeep, letterSpacing: 1 },
});
