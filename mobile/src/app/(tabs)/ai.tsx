import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, errorText, type ChatMessage } from '@/api';
import { useAuth } from '@/auth';
import { Mascot } from '@/components/Mascot';
import { T } from '@/components/ui';
import { colors, font, radius, shadow } from '@/theme';

// Same examples as the website – no purple on the AI page (user decision 2026-11-23).
const EXAMPLES = [
  'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.',
  'Ich trainiere Dienstag und Donnerstag von 17 bis 18:30 Fußball.',
  'Was steht morgen an?',
  'Wann habe ich diese Woche Zeit für Freunde?',
];

type Msg = ChatMessage & { actions?: string[]; failed?: boolean };

export default function Ai() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    api<{ enabled: boolean; messages: ChatMessage[] }>('/ai')
      .then(r => { setEnabled(r.enabled); setMessages(r.messages); })
      .catch(() => {});
  }, []);
  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50); }, [messages.length, busy]);

  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    setText('');
    setMessages(m => [...m, { id: `u${Date.now()}`, role: 'user', content: message }]);
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; reply: string; actions: string[] }>('/ai', { method: 'POST', body: { message } });
      setMessages(m => [...m, { id: `a${Date.now()}`, role: 'assistant', content: r.reply, actions: r.actions, failed: !r.ok }]);
    } catch (e) {
      setMessages(m => [...m, { id: `e${Date.now()}`, role: 'assistant', content: errorText(e), failed: true }]);
    } finally { setBusy(false); }
  }, [busy]);

  const newChat = () => Alert.alert('Neuer Chat?', 'Der Verlauf wird geleert. Was CLOQI über dich weiß, bleibt erhalten.', [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Neuer Chat', onPress: () => { void api('/ai', { method: 'DELETE' }).then(() => setMessages([])); } },
  ]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <View style={st.head}>
          <Mascot name={user?.mascot} variant="head" size={42} />
          <View style={{ flex: 1 }}>
            <T variant="eyebrow" style={{ color: colors.leafDark }}>CLOQI AI</T>
            <T variant="h2">Frag CLOQI</T>
          </View>
          {messages.length > 0 && <Pressable onPress={newChat} hitSlop={10}><T style={{ color: colors.leafDark, fontFamily: font.bold }}>Neuer Chat</T></Pressable>}
        </View>

        <FlatList
          ref={list}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ gap: 12 }}>
              <View style={st.welcome}>
                <T style={{ fontFamily: font.semibold, fontSize: 17, lineHeight: 24 }}>
                  Hey {user?.name || 'du'}! Erzähl mir, was ansteht. Ich trage alles ein und plane drumherum.
                </T>
                {!enabled && <T variant="small" style={{ marginTop: 8 }}>Die KI ist auf dem Server noch nicht eingerichtet – ich verstehe gerade nur einfache Befehle auf der Website.</T>}
              </View>
              {EXAMPLES.map(e => (
                <Pressable key={e} accessibilityRole="button" onPress={() => send(e)} style={({ pressed }) => [st.example, pressed && { backgroundColor: colors.leafSoft }]}>
                  <T style={{ color: colors.leafDeep, fontFamily: font.medium }}>{e}</T>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[st.bubble, item.role === 'user' ? st.mine : st.theirs, item.failed && { backgroundColor: colors.dangerSoft }]}>
              <T style={item.role === 'user' ? { color: colors.white } : undefined}>{item.content}</T>
              {!!item.actions?.length && (
                <View style={{ gap: 4, marginTop: 8 }}>
                  {item.actions.map((a, i) => <T key={i} variant="small" style={st.action}>✓ {a}</T>)}
                </View>
              )}
            </View>
          )}
          ListFooterComponent={busy ? <View style={[st.bubble, st.theirs, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}><ActivityIndicator color={colors.leaf} /><T variant="muted">CLOQI denkt …</T></View> : undefined}
        />

        <View style={st.composer}>
          <TextInput
            value={text} onChangeText={setText} placeholder="„Ich habe am Freitag einen Englisch-Test.“" placeholderTextColor={colors.inkFaint}
            style={st.input} multiline maxLength={2000} accessibilityLabel="Nachricht an CLOQI"
          />
          <Pressable onPress={() => send(text)} disabled={!text.trim() || busy} style={[st.send, (!text.trim() || busy) && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel="Senden">
            <Ionicons name="arrow-up" size={22} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  welcome: { backgroundColor: colors.white, borderRadius: radius.xl, padding: 18, ...shadow },
  example: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubble: { maxWidth: '86%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.leafDark, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 6, ...shadow },
  action: { color: colors.leafDeep, backgroundColor: colors.leafSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, margin: 12, padding: 6, paddingLeft: 14, backgroundColor: colors.white, borderRadius: 26, ...shadow },
  input: { flex: 1, maxHeight: 120, paddingVertical: 10, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.leafDark, alignItems: 'center', justifyContent: 'center' },
});
