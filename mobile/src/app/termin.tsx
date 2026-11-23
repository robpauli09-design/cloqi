import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { api, errorText, type Item } from '@/api';
import { ask } from '@/confirm';
import { formatLong } from '@/dates';
import { Button, ErrorBox, T } from '@/components/ui';
import { categoryColor, categoryLabel, colors, font, itemMark, MARK_STYLE, radius } from '@/theme';

/**
 * Details of one calendar entry (like tapping an event in Google Calendar):
 * events → edit / delete (series: only this one or all), study blocks & tests → done / delete,
 * lessons from WebUntis → read-only.
 */
export default function Termin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ item: string }>();
  const item = JSON.parse(p.item ?? '{}') as Item;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mark = itemMark(item);
  const color = mark ? MARK_STYLE[mark].color : categoryColor[item.category] ?? colors.leafDark;
  const isEvent = item.kind === 'event' && !item.readOnly;
  const isStudy = item.kind === 'study';
  const isTask = item.kind === 'deadline';
  const done = item.status === 'done';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const edit = (scope: 'single' | 'series') => router.replace({
    pathname: '/neuer-termin',
    params: { id: item.id, scope, ...(item.occurrenceDate ? { occ: item.occurrenceDate } : {}) },
  });
  const removeEvent = (scope: 'single' | 'series') => run(() => api(`/events/${encodeURIComponent(item.id)}?scope=${scope}${item.occurrenceDate ? `&occ=${item.occurrenceDate}` : ''}`, { method: 'DELETE' }));

  const askEdit = () => {
    if (!item.recurring) return edit('series');
    ask('Wiederholender Termin', 'Was möchtest du bearbeiten?', [
      { text: 'Nur diesen Termin', onPress: () => edit('single') },
      { text: 'Alle Termine der Serie', onPress: () => edit('series') },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };
  const askDelete = () => {
    if (isEvent && item.recurring) {
      return ask('Wiederholenden Termin löschen?', undefined, [
        { text: 'Nur diesen Termin', style: 'destructive', onPress: () => void removeEvent('single') },
        { text: 'Alle Termine der Serie', style: 'destructive', onPress: () => void removeEvent('series') },
        { text: 'Abbrechen', style: 'cancel' },
      ]);
    }
    ask(isTask ? 'Test löschen?' : isStudy ? 'Lernblock löschen?' : 'Termin löschen?', isTask ? 'Die geplanten Lernblöcke werden mitgelöscht.' : undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive', onPress: () => void run(() => isEvent
          ? api(`/events/${encodeURIComponent(item.id)}?scope=series`, { method: 'DELETE' })
          : api(`/items/${item.kind}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })),
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={st.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Schließen"><Ionicons name="close" size={26} color={colors.inkSoft} /></Pressable>
        <View style={{ flex: 1 }} />
        {isEvent && <Pressable onPress={askEdit} hitSlop={10} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Bearbeiten"><Ionicons name="create-outline" size={23} color={colors.inkSoft} /></Pressable>}
        {(isEvent || isStudy || isTask) && <Pressable onPress={askDelete} hitSlop={10} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Löschen"><Ionicons name="trash-outline" size={22} color={colors.inkSoft} /></Pressable>}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={[st.swatch, { backgroundColor: color }]} />
          <View style={{ flex: 1, gap: 4 }}>
            {mark && <View style={[st.badge, { backgroundColor: MARK_STYLE[mark].color }]}><T style={st.badgeText}>{MARK_STYLE[mark].label}</T></View>}
            <T style={[st.title, (item.status === 'cancelled' || done) && { textDecorationLine: 'line-through' }]}>{item.title}</T>
            <T variant="muted">{formatLong(item.date)}{item.allDay ? ' · ganztägig' : ` · ${item.start}–${item.end}`}</T>
            {item.recurring && <T variant="small">Wiederholt sich</T>}
          </View>
        </View>
        <View style={st.rows}>
          {item.location && <Row icon="location-outline" text={item.location} />}
          {item.teacher && <Row icon="person-outline" text={item.teacher} />}
          <Row icon="pricetag-outline" text={`${item.kind === 'study' ? 'Lernblock' : categoryLabel[item.category] ?? item.category}${item.status === 'cancelled' ? ' · entfällt' : item.status === 'missed' ? ' · verpasst' : done ? ' · erledigt' : ''}`} />
          <Row icon="calendar-outline" text={item.calendarLabel} />
          {item.description && <Row icon="document-text-outline" text={item.description} />}
        </View>
        {item.readOnly && item.kind !== 'study' && item.kind !== 'deadline' && (
          <T variant="small">Dieser Eintrag kommt aus {item.source === 'webuntis' ? 'WebUntis' : 'einem verbundenen Kalender'} und wird dort verwaltet.</T>
        )}
        <ErrorBox text={error} />
        {(isStudy || isTask) && (
          <Button title={done ? 'Wieder öffnen' : isTask ? 'Als erledigt markieren' : 'Lernblock erledigt'} variant={done ? 'outline' : 'primary'} loading={busy}
            icon={<Ionicons name={done ? 'refresh' : 'checkmark'} size={18} color={done ? colors.ink : colors.white} />}
            onPress={() => void run(() => api(`/items/${item.kind}/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: { done: !done } }))} />
        )}
        {isEvent && <Button title="Bearbeiten" variant="outline" onPress={askEdit} icon={<Ionicons name="create-outline" size={18} color={colors.ink} />} />}
      </ScrollView>
    </View>
  );
}

function Row({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={19} color={colors.inkSoft} style={{ marginTop: 1 }} />
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 16, height: 16, borderRadius: 5, marginTop: 8 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 30 },
  rows: { gap: 14, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16 },
  badge: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { color: colors.white, fontFamily: font.bold, fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 0.4 },
});
