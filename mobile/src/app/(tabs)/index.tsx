import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, errorText, type Item, type Today } from '@/api';
import { useAuth } from '@/auth';
import { addDays, dayNum, formatLong, greeting, monthYear, relativeDay, startOfWeek, WEEKDAYS_SHORT } from '@/dates';
import { ItemRow } from '@/components/ItemRow';
import { Mascot } from '@/components/Mascot';
import { Card, ErrorBox, Pill, Segmented, T } from '@/components/ui';
import { colors, font, itemMark, MARK_STYLE, radius, shadow } from '@/theme';

type View_ = 'heute' | 'woche';

export default function Kalender() {
  const [view, setView] = useState<View_>('heute');
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <Segmented<View_> value={view} onChange={setView} options={[{ value: 'heute', label: 'Heute' }, { value: 'woche', label: 'Woche' }]} />
      </View>
      {view === 'heute' ? <TodayView /> : <WeekView />}
      <Pressable onPress={() => router.push('/neuer-termin')} style={({ pressed }) => [st.fab, pressed && { transform: [{ scale: 0.94 }] }]} accessibilityRole="button" accessibilityLabel="Neuer Termin">
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>
    </SafeAreaView>
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
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return { data, error, refreshing, reload };
}

function TodayView() {
  const { user } = useAuth();
  const { data, error, refreshing, reload } = useApi<Today>('/today');
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
        {data?.items.map(i => <ItemRow key={i.key} item={i} />)}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <T style={{ fontFamily: font.bold, fontSize: 16 }}>{value}</T>
      <T variant="small">{label}</T>
    </View>
  );
}

function WeekView() {
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
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  if (!selected || !monday) return <View style={st.scroll}><ErrorBox text={error} /></View>;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const dayItems = (items ?? []).filter(i => i.date === selected);

  return (
    <ScrollView contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.leaf} />}>
      <View style={st.weekHead}>
        <Pressable onPress={() => setSelected(addDays(selected, -7))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Vorige Woche"><Ionicons name="chevron-back" size={24} color={colors.leafDark} /></Pressable>
        <T variant="h2">{monthYear(monday)}</T>
        <Pressable onPress={() => setSelected(addDays(selected, 7))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Nächste Woche"><Ionicons name="chevron-forward" size={24} color={colors.leafDark} /></Pressable>
      </View>
      <View style={st.strip}>
        {days.map((d, i) => {
          const on = d === selected;
          const count = (items ?? []).filter(x => x.date === d && x.status !== 'cancelled').length;
          const exam = (items ?? []).some(x => x.date === d && itemMark(x) === 'exam');
          return (
            <Pressable key={d} onPress={() => setSelected(d)} style={[st.day, on && st.dayOn]}>
              <T variant="small" style={on ? { color: 'rgba(255,255,255,0.8)' } : undefined}>{WEEKDAYS_SHORT[i]}</T>
              <T style={[st.dayNum, on && { color: colors.white }, d === today && !on && { color: colors.leafDark }]}>{dayNum(d)}</T>
              <View style={[st.dot, { opacity: count ? 1 : 0 }, on && { backgroundColor: colors.lime }, exam && { backgroundColor: MARK_STYLE.exam.color, width: 7, height: 7, borderRadius: 4 }]} />
            </Pressable>
          );
        })}
      </View>
      {today && selected !== today && (
        <Pressable onPress={() => setSelected(today)} style={{ alignSelf: 'center' }}><T style={{ color: colors.leafDark, fontFamily: font.bold }}>Zu heute</T></Pressable>
      )}
      <ErrorBox text={error} />
      <Card style={{ gap: 10 }}>
        <T variant="h2">{today ? relativeDay(selected, today) : formatLong(selected)}</T>
        {items && !dayItems.length && <T variant="muted">Nichts eingetragen.</T>}
        {dayItems.map(i => <ItemRow key={i.key} item={i} />)}
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  scroll: { padding: 16, gap: 14, paddingBottom: 120 },
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
