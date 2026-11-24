import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { api, errorText, type Item, type Today } from '@/api';
import { useAuth } from '@/auth';
import { addDays, dayNum, formatLong, greeting, monthYear, relativeDay, startOfWeek, WEEKDAYS_SHORT } from '@/dates';
import { DayView } from '@/components/DayView';
import { onSynced, syncSoon } from '@/sync';
import { ItemRow } from '@/components/ItemRow';
import { Mascot } from '@/components/Mascot';
import { Card, ErrorBox, Pill, Segmented, T } from '@/components/ui';
import { colors, font, itemMark, MARK_STYLE, radius, shadow } from '@/theme';

type View_ = 'heute' | 'tag' | 'liste';

export default function Kalender() {
  const [view, setView] = useState<View_>('heute');
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Segmented<View_> value={view} onChange={v => { setSearching(false); setView(v); }} options={[{ value: 'heute', label: 'Heute' }, { value: 'tag', label: 'Tag' }, { value: 'liste', label: 'Liste' }]} />
        </View>
        <Pressable onPress={() => setSearching(s => !s)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Termine suchen" style={[st.searchBtn, searching && { backgroundColor: colors.leafSoft }]}>
          <Ionicons name={searching ? 'close' : 'search'} size={20} color={colors.leafDark} />
        </Pressable>
      </View>
      {searching ? <SearchView /> : view === 'heute' ? <TodayView /> : <CalendarView mode={view} />}
      <Pressable onPress={() => router.push('/neuer-termin')} style={({ pressed }) => [st.fab, pressed && { transform: [{ scale: 0.94 }] }]} accessibilityRole="button" accessibilityLabel="Neuer Termin">
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

/** Search like Google Calendar: title, place, notes – tap a hit to open it. */
function SearchView() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      api<{ items: Item[] }>(`/calendar/search?q=${encodeURIComponent(q.trim())}`)
        .then(r => { if (alive) { setHits(r.items); setError(null); } })
        .catch(e => { if (alive) setError(errorText(e)); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const shown = q.trim().length >= 2 ? hits : null; // short input: no results shown
  return (
    <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
      <TextInput value={q} onChangeText={setQ} placeholder="Termine suchen (z. B. Fußball, Arzt)" autoFocus returnKeyType="search"
        style={st.searchInput} placeholderTextColor={colors.inkFaint} accessibilityLabel="Suchbegriff" />
      <ErrorBox text={error} />
      {shown && !shown.length && <T variant="muted">Nichts gefunden.</T>}
      {shown?.map(i => <ItemRow key={i.key} item={i} showDate onPress={() => router.push({ pathname: '/termin', params: { item: JSON.stringify(i) } })} />)}
    </ScrollView>
  );
}

/** Loads an API path whenever the screen comes into focus; pull-to-refresh via reload(true). */
function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try { setData(await api<T>(path)); setError(null); } catch (e) { setError(errorText(e)); } finally { setRefreshing(false); }
  }, [path]);
  useFocusEffect(useCallback(() => { void reload(); void syncSoon(); }, [reload]));
  useEffect(() => onSynced(() => { void reload(); }), [reload]);
  return { data, error, refreshing, reload };
}

// first chat ideas (same as the website's Home) – tapping one opens CLOQI AI with the text ready to send
const FIRST: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; text: string }[] = [
  { icon: 'calendar-outline', label: 'Test eintragen', text: 'Ich habe nächsten Donnerstag einen Mathe-Test, Kapitel 4 und 5.' },
  { icon: 'barbell-outline', label: 'Training eintragen', text: 'Ich habe jeden Dienstag und Donnerstag von 18 bis 19:30 Training.' },
  { icon: 'sunny-outline', label: 'Was steht morgen an?', text: 'Was steht morgen an?' },
];

function TodayView() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, error, refreshing, reload } = useApi<Today>('/today');
  const chats = useApi<{ threads: unknown[] }>('/ai/threads');
  const openAi = (q?: string) => router.push({ pathname: '/ai', params: q ? { q } : {} });
  return (
    <ScrollView contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.leaf} />}>
      <View style={st.hero}>
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="eyebrow">{data ? formatLong(data.today) : ' '}</T>
          <T variant="h1">{greeting()}, {user?.name || 'du'}!</T>
          {data?.insight ? <T variant="muted">{data.insight}</T> : null}
        </View>
        <Mascot name={user?.mascot} variant="bust" size={96} />
      </View>
      <ErrorBox text={error} />

      {chats.data && chats.data.threads.length === 0 && (
        <Card style={{ gap: 12, borderWidth: 2, borderColor: '#7CC51B55' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={st.firstIcon}><Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.leafDark} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="h2">Schreib CLOQI deine erste Nachricht</T>
              <T variant="muted">Sag einfach, was ansteht – CLOQI trägt es ein und plant drumherum.</T>
            </View>
          </View>
          <Pressable onPress={() => openAi()} accessibilityRole="button" accessibilityLabel="CLOQI AI öffnen" style={st.fakeInput}>
            <T variant="muted" style={{ flex: 1 }}>Schreib CLOQI …</T>
            <View style={st.fakeSend}><Ionicons name="arrow-up" size={18} color={colors.white} /></View>
          </Pressable>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FIRST.map(f => (
              <Pressable key={f.label} onPress={() => openAi(f.text)} accessibilityRole="button" style={st.firstChip}>
                <Ionicons name={f.icon} size={14} color={colors.leafDark} />
                <T style={{ fontFamily: font.medium, fontSize: 13 }}>{f.label}</T>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {data && (
        <View style={st.stats}>
          <Stat label="Serie" value={`${data.progress.streak} 🔥`} />
          <Stat label="Lernzeit heute" value={`${data.progress.todayMinutes}/${data.progress.dailyGoal} Min`} />
          <Stat label="Lernblöcke Woche" value={`${data.progress.weekDone}/${data.progress.weekPlanned}`} />
        </View>
      )}

      {data?.suggestions.map(s => (
        <Card key={s.id} style={{ backgroundColor: colors.warnSoft, gap: 4 }}>
          <T variant="label" style={{ color: '#A55912' }}>Vorschlag</T>
          <T>{s.message}</T>
        </Card>
      ))}

      <Card style={{ gap: 10 }}>
        <T variant="h2">Mein Tag</T>
        {data && !data.items.length && (
          <View style={{ alignItems: 'center', paddingVertical: 12, gap: 6 }}>
            <Mascot name={user?.mascot} variant="head" size={64} />
            <T style={{ fontFamily: font.semibold }}>Heute ist noch nichts eingetragen.</T>
            <T variant="muted" style={{ textAlign: 'center' }}>Sag CLOQI AI einfach, was ansteht.</T>
          </View>
        )}
        {data && <DayList items={data.items} today={data.today} onOpen={i => router.push({ pathname: '/termin', params: { item: JSON.stringify(i) } })} />}
        {data?.freeToday[0] && (
          <View style={st.free}><T style={{ color: colors.leafDeep, fontFamily: font.medium }}>Freie Zeit: {data.freeToday[0].start}–{data.freeToday[0].end} Uhr</T></View>
        )}
      </Card>

      {!!data?.openTasks.length && (
        <Card style={{ gap: 10 }}>
          <T variant="h2">Bald fällig</T>
          {data.openTasks.map(t => (
            <View key={t.id} style={st.task}>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{t.title}</T>
                <T variant="small">{t.subject}</T>
              </View>
              <Pill color={colors.danger} bg={colors.dangerSoft}>{relativeDay(t.due, data.today)}</Pill>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

/** "Mein Tag": only what is still coming (max. 4), the whole day behind "Alle anzeigen". */
function DayList({ items, today, onOpen }: { items: Item[]; today: string; onOpen(i: Item): void }) {
  const [all, setAll] = useState(false);
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = items.filter(i => i.allDay || i.date > today || i.end > hm);
  const shown = all ? items : upcoming.slice(0, 4);
  return (
    <>
      {!all && !upcoming.length && items.length > 0 && <T variant="muted">Für heute ist alles erledigt. 🎉</T>}
      {shown.map(i => <ItemRow key={i.key} item={i} onPress={() => onOpen(i)} />)}
      {items.length > shown.length || all ? (
        <Pressable onPress={() => setAll(a => !a)} hitSlop={8} accessibilityRole="button">
          <T style={{ color: colors.leafDark, fontFamily: font.bold }}>{all ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}</T>
        </Pressable>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <T style={{ fontFamily: font.bold, fontSize: 16 }}>{value}</T>
      <T variant="small">{label}</T>
    </View>
  );
}

/** Day (hour grid, like Google Calendar) or list view, with a week strip on top. */
function CalendarView({ mode }: { mode: 'tag' | 'liste' }) {
  const router = useRouter();
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const monday = selected ? startOfWeek(selected) : null;

  useEffect(() => {
    api<{ from: string }>('/calendar?days=1')
      .then(t => { setToday(t.from); setSelected(t.from); })
      .catch(e => setError(errorText(e)));
  }, []);
  const reload = useCallback(async (pull = false) => {
    if (!monday) return;
    if (pull) setRefreshing(true);
    try { setItems((await api<{ items: Item[] }>(`/calendar?from=${monday}&days=7`)).items); setError(null); }
    catch (e) { setError(errorText(e)); }
    finally { setRefreshing(false); }
  }, [monday]);
  useFocusEffect(useCallback(() => { void reload(); void syncSoon(); }, [reload]));
  useEffect(() => onSynced(() => { void reload(); }), [reload]);
  const swipe = useCallback((dir: 1 | -1) => { void Haptics.selectionAsync(); setSelected(d => (d ? addDays(d, dir) : d)); }, []);

  if (!selected || !monday) return <View style={st.scroll}><ErrorBox text={error} /></View>;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const dayItems = (items ?? []).filter(i => i.date === selected || (i.date < selected && (i as Item & { endDate?: string }).endDate! >= selected && !i.allDay));
  const open = (i: Item) => router.push({ pathname: '/termin', params: { item: JSON.stringify(i) } });

  const header = (
    <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 8 }}>
      <View style={st.weekHead}>
        <Pressable onPress={() => setSelected(addDays(selected, -7))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Vorige Woche"><Ionicons name="chevron-back" size={24} color={colors.leafDark} /></Pressable>
        <Pressable onPress={() => today && setSelected(today)} accessibilityRole="button" accessibilityLabel="Zu heute">
          <T variant="h2">{monthYear(selected)}</T>
        </Pressable>
        <Pressable onPress={() => setSelected(addDays(selected, 7))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Nächste Woche"><Ionicons name="chevron-forward" size={24} color={colors.leafDark} /></Pressable>
      </View>
      <View style={st.strip}>
        {days.map((d, i) => {
          const on = d === selected;
          const count = (items ?? []).filter(x => x.date === d && x.status !== 'cancelled').length;
          const exam = (items ?? []).some(x => x.date === d && itemMark(x) === 'exam');
          return (
            <Pressable key={d} onPress={() => setSelected(d)} style={[st.day, on && st.dayOn]} accessibilityRole="button" accessibilityLabel={formatLong(d)}>
              <T variant="small" style={on ? { color: 'rgba(255,255,255,0.8)' } : undefined}>{WEEKDAYS_SHORT[i]}</T>
              <T style={[st.dayNum, on && { color: colors.white }, d === today && !on && { color: colors.leafDark }]}>{dayNum(d)}</T>
              <View style={[st.dot, { opacity: count ? 1 : 0 }, on && { backgroundColor: colors.lime }, exam && { backgroundColor: MARK_STYLE.exam.color, width: 7, height: 7, borderRadius: 4 }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T style={{ fontFamily: font.bold }}>{today ? relativeDay(selected, today) : formatLong(selected)}</T>
        {today && selected !== today && <Pressable onPress={() => setSelected(today)} hitSlop={8}><T style={{ color: colors.leafDark, fontFamily: font.bold }}>Zu heute</T></Pressable>}
      </View>
      <ErrorBox text={error} />
    </View>
  );

  if (mode === 'tag') {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <DayView date={selected} today={today ?? selected} items={dayItems} onOpen={open} onSwipe={swipe}
          onCreate={(date, start) => router.push({ pathname: '/neuer-termin', params: { date, start } })} />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.leaf} />}>
      {header}
      <View style={{ paddingHorizontal: 16 }}>
        <Card style={{ gap: 10 }}>
          {items && !dayItems.length && <T variant="muted">Nichts eingetragen.</T>}
          {dayItems.map(i => <ItemRow key={i.key} item={i} onPress={() => open(i)} />)}
        </Card>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { padding: 16, gap: 14, paddingBottom: 120 },
  searchBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  searchInput: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.regular, fontSize: 16, color: colors.ink },
  firstIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.leafSoft, alignItems: 'center', justifyContent: 'center' },
  fakeInput: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 22, paddingLeft: 16, padding: 6 },
  fakeSend: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.leafDark, alignItems: 'center', justifyContent: 'center' },
  firstChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: 12, gap: 2, ...shadow },
  free: { backgroundColor: colors.leafSoft, borderRadius: radius.md, padding: 12 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.white, gap: 2 },
  dayOn: { backgroundColor: colors.leafDark },
  dayNum: { fontFamily: font.bold, fontSize: 17 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.leaf },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.leafDark, alignItems: 'center', justifyContent: 'center', ...shadow },
});
