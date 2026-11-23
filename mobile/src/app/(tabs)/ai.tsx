import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState,
} from 'expo-audio';
import { api, apiStream, errorText, type ChatMessage } from '@/api';
import { useAuth } from '@/auth';
import { ChatMarkdown } from '@/components/ChatMarkdown';
import { Mascot } from '@/components/Mascot';
import { T } from '@/components/ui';
import { MAX_FILES, pickFiles, pickPhotos, readBase64, takePhoto, type Attachment } from '@/media';
import { colors, font, radius, shadow } from '@/theme';

// Minimal, like Claude/ChatGPT: a few quiet starters (short label, full sentence is sent).
// Same list as the website (app/(app)/ai/Chat.tsx). No purple on the AI page (user decision 2026-11-23).
const STARTERS: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; text: string }[] = [
  { icon: 'calendar-outline', label: 'Test eintragen', text: 'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.' },
  { icon: 'sunny-outline', label: 'Was steht morgen an?', text: 'Was steht morgen an?' },
  { icon: 'time-outline', label: 'Freie Zeit diese Woche', text: 'Wann habe ich diese Woche Zeit für Freunde?' },
];
const BARS = 28;
const MAX_RECORD_MS = 180_000;

type Msg = ChatMessage & { actions?: string[]; failed?: boolean; status?: string; streaming?: boolean; steps?: string[] };
interface Thread { id: string; title: string; updatedAt: string }

export default function Ai() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState<Thread[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const list = useRef<FlatList<Msg>>(null);

  // voice: record → transcribe on the server → text lands in the input
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true });
  const rec = useAudioRecorderState(recorder, 80);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.1));

  useEffect(() => {
    api<{ enabled: boolean }>('/ai').then(r => setEnabled(r.enabled)).catch(() => {});
  }, []);
  // Stick to the bottom like ChatGPT: at the bottom, growing answers keep you there; scroll up and it stays put.
  const stick = useRef(true);
  const lastY = useRef(0);
  const dragging = useRef(false);
  type ScrollEv = { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } };
  const gapOf = ({ nativeEvent: n }: ScrollEv) => n.contentSize.height - (n.contentOffset.y + n.layoutMeasurement.height);
  // our own auto-scroll only ever moves down – so moving up is always the user: stop following.
  // Reaching the bottom again (not while the finger is still on the list) resumes following.
  const onScroll = (e: ScrollEv) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < lastY.current - 2 && gapOf(e) >= 40) stick.current = false;
    else if (!dragging.current && gapOf(e) < 40) stick.current = true;
    lastY.current = y;
  };
  const onDragStart = () => { dragging.current = true; stick.current = false; };
  const onDragEnd = (e: ScrollEv) => { dragging.current = false; if (gapOf(e) < 40) stick.current = true; };

  const follow = () => { if (stick.current) list.current?.scrollToEnd({ animated: false }); };

  const stopRecorder = useCallback(async () => {
    setRecording(false);
    try { await recorder.stop(); } catch { /* already stopped */ }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [recorder]);

  const finishVoice = useCallback(async () => {
    await stopRecorder();
    const uri = recorder.uri;
    if (!uri) return;
    setTranscribing(true);
    try {
      const audio = await readBase64(uri);
      const r = await api<{ text: string }>('/transcribe', { method: 'POST', body: { audio, mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4' } });
      setText(t => (t ? `${t} ${r.text}` : r.text));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { Alert.alert('Spracheingabe', errorText(e)); } finally { setTranscribing(false); }
  }, [recorder, stopRecorder]);

  useEffect(() => {
    if (!recording) return;
    // metering is in dBFS (about -60 … 0); without metering (web preview) the bars breathe gently
    const level = typeof rec.metering === 'number' ? Math.max(0.08, Math.min(1, (rec.metering + 55) / 50)) : 0.25 + Math.random() * 0.3;
    setLevels(l => [...l.slice(1), level]);
    if (rec.durationMillis > MAX_RECORD_MS) void finishVoice();
  }, [rec.metering, rec.durationMillis, recording, finishVoice]);

  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if ((!message && !files.length) || busy) return;
    const sending = files;
    setText(''); setFiles([]);
    stick.current = true;
    setMessages(m => [...m, { id: `u${Date.now()}`, role: 'user', content: message + (sending.length ? `${message ? '\n' : ''}📎 ${sending.map(f => f.name).join(', ')}` : '') }]);
    setBusy(true);
    // the answer is streamed: status first ("Schaut in deinen Kalender …"), then the text piece by piece
    const aid = `a${Date.now()}`;
    const patch = (f: (m: Msg) => Msg) => setMessages(ms => ms.map(m => (m.id === aid ? f(m) : m)));
    setMessages(m => [...m, { id: aid, role: 'assistant', content: '', status: 'Denkt nach …', streaming: true }]);
    let finished = false;
    let tid = threadId;
    try {
      await apiStream('/ai/stream', { message, threadId, attachments: sending.map(({ name, mime, data }) => ({ name, mime, data })) }, e => {
        if (e.type === 'thread') { tid = e.id; setThreadId(e.id); }
        else if (e.type === 'status') patch(m => ({
          ...m, status: e.text,
          // keep every real step visible (like Claude/ChatGPT), not just the latest flash
          steps: e.text === 'Denkt nach …' || m.steps?.[m.steps.length - 1] === e.text ? m.steps : [...(m.steps ?? []), e.text],
        }));
        else if (e.type === 'delta') patch(m => ({ ...m, content: m.content + e.text, status: undefined }));
        else if (e.type === 'reset') patch(m => ({ ...m, content: '' }));
        else if (e.type === 'done') {
          finished = true;
          if (e.threadId) setThreadId(e.threadId);
          setHistory(null);
          patch(m => ({ ...m, content: e.reply, actions: e.actions, failed: !e.ok, streaming: false, status: undefined }));
          if (e.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });
      if (!finished) throw new Error('Die Verbindung wurde unterbrochen. Versuch es bitte nochmal.');
    } catch (e) {
      // connection dropped (e.g. app was in the background) – the server still finishes and saves
      // the answer, so fetch it from the conversation instead of showing an error
      const reply = tid ? await waitForReply(tid, message) : null;
      if (reply) patch(m => ({ ...m, content: reply, failed: false, streaming: false, status: undefined }));
      else patch(m => ({ ...m, content: errorText(e), failed: true, streaming: false, status: undefined }));
    } finally { setBusy(false); }
  }, [busy, files, threadId]);

  /** Polls the saved conversation until CLOQI's answer to `message` is there (max. ~3 minutes). */
  const waitForReply = async (tid: string, message: string): Promise<string | null> => {
    for (let i = 0; i < 70; i++) {
      try {
        const r = await api<{ messages: ChatMessage[] }>(`/ai?thread=${tid}`);
        const last = r.messages[r.messages.length - 1];
        const asked = r.messages.map(m => m.role === 'user' && m.content.startsWith(message)).lastIndexOf(true);
        if (last?.role === 'assistant' && asked >= 0 && asked < r.messages.length - 1) return last.content;
      } catch { /* offline – try again */ }
      await new Promise(res => setTimeout(res, 2500));
    }
    return null;
  };

  const newChat = () => { setMessages([]); setThreadId(null); setFiles([]); setText(''); setHistoryOpen(false); };

  const openHistory = () => {
    setHistoryOpen(true);
    if (!history) api<{ threads: Thread[] }>('/ai/threads').then(r => setHistory(r.threads)).catch(e => Alert.alert('Verlauf', errorText(e)));
  };
  const openThread = async (t: Thread) => {
    try {
      const r = await api<{ messages: ChatMessage[] }>(`/ai?thread=${t.id}`);
      setThreadId(t.id); setMessages(r.messages); setHistoryOpen(false);
    } catch (e) { Alert.alert('Chat', errorText(e)); }
  };
  const removeThread = (t: Thread) => Alert.alert('Chat löschen?', `„${t.title}“ wird gelöscht. Was CLOQI über dich weiß, bleibt erhalten.`, [
    { text: 'Abbrechen', style: 'cancel' },
    {
      text: 'Löschen', style: 'destructive', onPress: () => {
        void api(`/ai/threads?id=${t.id}`, { method: 'DELETE' }).then(() => {
          setHistory(h => h?.filter(x => x.id !== t.id) ?? null);
          if (t.id === threadId) newChat();
        });
      },
    },
  ]);

  const attach = async (how: 'camera' | 'photos' | 'files') => {
    setMenu(false);
    const room = MAX_FILES - files.length;
    if (room <= 0) return Alert.alert('Anhänge', `Höchstens ${MAX_FILES} Anhänge pro Nachricht.`);
    try {
      const got = how === 'camera' ? await takePhoto() : how === 'photos' ? await pickPhotos(room) : await pickFiles(room);
      if (got) setFiles(f => [...f, ...got].slice(0, MAX_FILES));
    } catch (e) { Alert.alert('Anhang', errorText(e)); }
  };

  const startVoice = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return Alert.alert('Mikrofon', 'Bitte erlaube CLOQI den Zugriff aufs Mikrofon (Einstellungen).');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setLevels(Array(BARS).fill(0.1));
      setRecording(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) { Alert.alert('Mikrofon', errorText(e)); }
  };

  const canSend = Boolean(text.trim() || files.length) && !busy;
  const seconds = Math.floor(rec.durationMillis / 1000);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.head}>
          <T style={st.title}>CLOQI AI</T>
          <Pressable onPress={openHistory} hitSlop={8} accessibilityRole="button" accessibilityLabel="Chat-Verlauf" style={st.headBtn}>
            <Ionicons name="time-outline" size={23} color={colors.inkSoft} />
          </Pressable>
          {messages.length > 0 && (
            <Pressable onPress={newChat} hitSlop={8} accessibilityRole="button" accessibilityLabel="Neuer Chat" style={st.headBtn}>
              <Ionicons name="create-outline" size={22} color={colors.inkSoft} />
            </Pressable>
          )}
        </View>

        <FlatList
          ref={list}
          data={messages}
          onScroll={onScroll}
          onScrollBeginDrag={onDragStart}
          onScrollEndDrag={onDragEnd}
          onMomentumScrollEnd={onDragEnd}
          scrollEventThrottle={32}
          onContentSizeChange={follow}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          // empty chat: nothing to scroll, so no bouncing
          scrollEnabled={messages.length > 0} bounces={messages.length > 0} alwaysBounceVertical={false} overScrollMode="never"
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={st.avatar}><Mascot name={user?.mascot} variant="head" size={60} /></View>
              <T style={st.question}>Was steht an{user?.name ? `, ${user.name}` : ''}?</T>
              <T variant="muted" style={{ textAlign: 'center' }}>Schreib oder sprich es einfach – ich trage es ein und plane drumherum.</T>
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
              {!!item.steps?.length && (
                <View style={[{ gap: 3 }, item.content ? { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line } : { marginBottom: 4 }]}>
                  {item.steps.map((stp, si) => {
                    const working = item.streaming && !item.content && si === item.steps!.length - 1 && item.status === stp;
                    return (
                      <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {working ? <ActivityIndicator size="small" color={colors.leaf} /> : <Ionicons name="checkmark" size={14} color={colors.leafDark} />}
                        <T variant="small">{working ? stp : stp.replace(/ …$/, '')}</T>
                      </View>
                    );
                  })}
                </View>
              )}
              {item.streaming && !item.content
                ? (item.status === 'Denkt nach …' || !item.steps?.length) ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={colors.leaf} /><T variant="muted">{item.status ?? 'Denkt nach …'}</T></View> : null
                : item.role === 'user'
                  ? <T style={{ color: colors.white }}>{item.content}</T>
                  : <ChatMarkdown text={item.content} cursor={item.streaming} />}
              {!!item.actions?.length && (
                <View style={{ gap: 4, marginTop: 8 }}>
                  {item.actions.map((a, i) => <T key={i} variant="small" style={st.action}>✓ {a}</T>)}
                </View>
              )}
            </View>
          )}
        />

        <View style={st.composer}>
          {files.length > 0 && !recording && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8, paddingTop: 4 }}>
              {files.map((f, i) => (
                <View key={i}>
                  {f.preview
                    ? <Image source={{ uri: f.preview }} style={st.thumb} />
                    : <View style={[st.thumb, st.fileThumb]}><Ionicons name="document-text-outline" size={18} color={colors.leafDark} /><T variant="small" numberOfLines={2}>{f.name}</T></View>}
                  <Pressable onPress={() => setFiles(x => x.filter((_, j) => j !== i))} style={st.remove} accessibilityRole="button" accessibilityLabel={`${f.name} entfernen`}>
                    <Ionicons name="close" size={12} color={colors.white} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {recording || transcribing ? (
            <View style={st.row}>
              <Pressable onPress={() => void stopRecorder()} disabled={transcribing} style={st.roundBtn} accessibilityRole="button" accessibilityLabel="Aufnahme verwerfen">
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
              <View style={st.wave}>
                {transcribing
                  ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={colors.leaf} /><T variant="muted">Wird umgewandelt …</T></View>
                  : levels.map((l, i) => <View key={i} style={[st.waveBar, { height: 5 + l * 30, opacity: 0.35 + l * 0.65 }]} />)}
              </View>
              {!transcribing && <T variant="small" style={{ width: 34 }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</T>}
              <Pressable onPress={() => void finishVoice()} disabled={transcribing} style={[st.roundBtn, st.sendBtn, transcribing && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel="Aufnahme fertig">
                <Ionicons name="checkmark" size={22} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <View style={st.row}>
              <Pressable onPress={() => setMenu(true)} disabled={!enabled} style={[st.roundBtn, !enabled && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Foto oder Datei hinzufügen">
                <Ionicons name="add" size={26} color={colors.inkSoft} />
              </Pressable>
              <TextInput
                value={text} onChangeText={setText} placeholder="Schreib CLOQI …" placeholderTextColor={colors.inkFaint}
                style={st.input} multiline maxLength={2000} accessibilityLabel="Nachricht an CLOQI"
              />
              {canSend ? (
                <Pressable onPress={() => send(text)} style={[st.roundBtn, st.sendBtn]} accessibilityRole="button" accessibilityLabel="Senden">
                  <Ionicons name="arrow-up" size={21} color={colors.white} />
                </Pressable>
              ) : (
                <Pressable onPress={startVoice} disabled={!enabled || busy} style={[st.roundBtn, (!enabled || busy) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Sprechen">
                  <Ionicons name="mic-outline" size={23} color={colors.inkSoft} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* + menu */}
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={st.backdrop} onPress={() => setMenu(false)} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={st.grabber} />
          {([
            ['camera', 'camera-outline', 'Foto aufnehmen'],
            ['photos', 'images-outline', 'Foto auswählen'],
            ['files', 'attach-outline', 'Datei hochladen'],
          ] as const).map(([how, icon, label]) => (
            <Pressable key={how} onPress={() => void attach(how)} style={({ pressed }) => [st.option, pressed && { backgroundColor: colors.leafSoft }]} accessibilityRole="button">
              <Ionicons name={icon} size={22} color={colors.leafDark} />
              <T style={{ fontFamily: font.medium, fontSize: 16 }}>{label}</T>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* chat history */}
      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistoryOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.paper, paddingBottom: insets.bottom }}>
          <View style={[st.head, { paddingTop: 8 }]}>
            <T style={st.title}>Verlauf</T>
            <Pressable onPress={newChat} hitSlop={8} style={st.headBtn} accessibilityRole="button" accessibilityLabel="Neuer Chat">
              <Ionicons name="create-outline" size={22} color={colors.inkSoft} />
            </Pressable>
            <Pressable onPress={() => setHistoryOpen(false)} hitSlop={8} style={st.headBtn} accessibilityRole="button" accessibilityLabel="Schließen">
              <Ionicons name="close" size={24} color={colors.inkSoft} />
            </Pressable>
          </View>
          {!history ? <ActivityIndicator color={colors.leaf} style={{ marginTop: 24 }} /> : (
            <FlatList
              data={history}
              keyExtractor={t => t.id}
              contentContainerStyle={{ padding: 8 }}
              ListEmptyComponent={<T variant="muted" style={{ padding: 16 }}>Noch keine Chats.</T>}
              renderItem={({ item }) => (
                <Pressable onPress={() => openThread(item)} onLongPress={() => removeThread(item)}
                  style={({ pressed }) => [st.thread, (pressed || item.id === threadId) && { backgroundColor: colors.leafSoft }]}>
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1} style={{ fontFamily: font.medium }}>{item.title}</T>
                    <T variant="small">{new Date(item.updatedAt).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })}</T>
                  </View>
                  <Pressable onPress={() => removeThread(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`„${item.title}“ löschen`}>
                    <Ionicons name="trash-outline" size={18} color={colors.inkFaint} />
                  </Pressable>
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 2 },
  title: { flex: 1, fontFamily: font.display, fontSize: 18, lineHeight: 24 },
  headBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  composer: { marginHorizontal: 12, marginTop: 8, marginBottom: 26, padding: 6, backgroundColor: colors.white, borderRadius: 26, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  roundBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { backgroundColor: colors.leafDark },
  input: { flex: 1, minHeight: 42, maxHeight: 120, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 4, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  wave: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, overflow: 'hidden' },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: colors.leafDark },
  thumb: { width: 62, height: 62, borderRadius: 14 },
  fileThumb: { width: 110, backgroundColor: colors.paper, padding: 8, justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(25,26,23,0.35)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 12, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 15, borderRadius: radius.md },
  thread: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md },
});
