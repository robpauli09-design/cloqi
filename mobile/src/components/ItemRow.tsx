import { StyleSheet, View } from 'react-native';
import type { Item } from '@/api';
import { categoryColor, categoryLabel, categorySoft, colors, font, itemMark, MARK_STYLE, radius } from '@/theme';
import { T } from './ui';

/** One calendar entry (lesson, event, study block, deadline) – like the agenda view on the website. */
export function ItemRow({ item }: { item: Item }) {
  const mark = itemMark(item);
  const ms = mark ? MARK_STYLE[mark] : null;
  const cancelled = mark === 'cancelled';
  const done = item.status === 'done';
  const color = ms?.color ?? categoryColor[item.category] ?? colors.leafDark;
  return (
    <View style={[st.row, { backgroundColor: ms?.soft ?? categorySoft[item.category] ?? colors.leafSoft }, cancelled && st.cancelled, mark === 'exam' && st.exam]}>
      <View style={[st.bar, { backgroundColor: color }]} />
      <View style={st.time}>
        {item.allDay ? <T style={st.timeText}>ganztägig</T> : <>
          <T style={[st.timeText, ms && { color: ms.text }]}>{item.start}</T>
          <T variant="small">{item.end}</T>
        </>}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {ms && <View style={[st.badge, { backgroundColor: ms.color }]}><T style={st.badgeText}>{ms.label}</T></View>}
          <T numberOfLines={1} style={[st.title, { flexShrink: 1 }, ms && { color: ms.text }, (cancelled || done) && { textDecorationLine: 'line-through' }]}>{item.title}</T>
        </View>
        <T variant="small" numberOfLines={1}>
          {item.status === 'missed' ? 'Verpasst · ' : ''}
          {[item.location, item.teacher, item.kind === 'study' ? 'Lernblock' : categoryLabel[item.category]].filter(Boolean).join(' · ')}
        </T>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, paddingVertical: 10, paddingRight: 12, overflow: 'hidden' },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  time: { width: 54 },
  timeText: { fontFamily: font.bold, fontSize: 14 },
  title: { fontFamily: font.semibold, fontSize: 15 },
  // Entfall: orange, dashed outline (the website uses diagonal stripes); Test: red outline
  cancelled: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: MARK_STYLE.cancelled.color },
  exam: { borderWidth: 1, borderColor: 'rgba(229,72,77,0.45)' },
  badge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: colors.white, fontFamily: font.bold, fontSize: 9, lineHeight: 13, textTransform: 'uppercase', letterSpacing: 0.4 },
});
