import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, errorText, type ChatMessage } from '@/api';
import { useAuth } from '@/auth';
import { Mascot } from '@/components/Mascot';
import { T } from '@/components/ui';
import { colors, font, radius, shadow } from '@/theme';

// Minimal, like Claude/ChatGPT: a few quiet starters (short label, full sentence is sent).
// Same list as the website (app/(app)/ai/Chat.tsx). No purple on the AI page (user decision 2026-11-23).
const STARTERS: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; text: string }[] = [
  { icon: 'calendar-outline', label: 'Test eintragen', text: 'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.' },
  { icon: 'sunny-outline', label: 'Was steht morgen an?', text: 'Was steht morgen an?' },
  { icon: 'time-outline', label: 'Freie Zeit diese Woche', text: 'Wann habe ich diese Woche Zeit für Freunde?' },
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
          <T style={st.title}>CLOQI AI</T>
          {messages.length > 0 && (
            <Pressable onPress={newChat} hitSlop={10} accessibilityRole="button" accessibilityLabel="Neuer Chat" style={st.headBtn}>
              <Ionicons name="create-outline" size={22} color={colors.inkSoft} />
            </Pressable>
          )}
        </View>

        <FlatList
          ref={list}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={st.avatar}><Mascot name={user?.mascot} variant="head" size={60} /></View>
              <T style={st.question}>Was steht an{user?.name ? `, ${user.name}` : ''}?</T>
              <T variant="muted" style={{ textAlign: 'center' }}>Schreib es einfach – ich trage es ein und plane drumherum.</T>
              {!enabled && <T variant="small" style={{ textAlign: 'center' }}>Die KI ist auf dem Server noch nicht eingerichtet.</T>}
              <View style={st.starters}>
                {STARTERS.map(x => (
                  <Pressable key={x.label} accessibilityRole="button" onPress={() => send(x.text)}
                    style={({ pressed }) => [st.starter, pressed && { backgroundColor: colors.white, borderColor: colors.leaf }]}>
                    <Ionicons name={x.icon} size={17} color={colors.leafDark} />
                    <T style={{ color: colors.inkSoft }}>{x.label}</T>
                  </Pressable>
                ))}
              </View>
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
            value={text} onChangeText={setText} placeholder="Schreib CLOQI …" placeholderTextColor={colors.inkFaint}
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
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { flex: 1, fontFamily: font.display, fontSize: 18, lineHeight: 24 },
  headBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: colors.leafSoft },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  question: { fontFamily: font.display, fontSize: 24, lineHeight: 30, marginTop: 10, textAlign: 'center' },
  starters: { alignSelf: 'stretch', gap: 8, marginTop: 22 },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,0.6)' },
  bubble: { maxWidth: '86%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.leafDark, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 6, ...shadow },
  action: { color: colors.leafDeep, backgroundColor: colors.leafSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  // extra bottom margin keeps the field clear of the raised CLOQI AI tab button
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 12, marginTop: 8, marginBottom: 26, padding: 6, paddingLeft: 14, backgroundColor: colors.white, borderRadius: 26, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, minHeight: 42, maxHeight: 120, paddingTop: 11, paddingBottom: 11, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.leafDark, alignItems: 'center', justifyContent: 'center' },
});
