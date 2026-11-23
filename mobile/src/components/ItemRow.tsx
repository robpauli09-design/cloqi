import { StyleSheet, View } from 'react-native';
import type { Item } from '@/api';
import { categoryColor, categoryLabel, categorySoft, colors, font, radius } from '@/theme';
import { T } from './ui';

/** One calendar entry (lesson, event, study block, deadline) – like the agenda view on the website. */
export function ItemRow({ item }: { item: Item }) {
  const cancelled = item.status === 'cancelled';
  const done = item.status === 'done';
  const color = categoryColor[item.category] ?? colors.leafDark;
  return (
    <View style={[st.row, { backgroundColor: categorySoft[item.category] ?? colors.leafSoft }, cancelled && { opacity: 0.55 }]}>
      <View style={[st.bar, { backgroundColor: color }]} />
      <View style={st.time}>
        {item.allDay ? <T style={st.timeText}>ganztägig</T> : <>
          <T style={st.timeText}>{item.start}</T>
          <T variant="small">{item.end}</T>
        </>}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={1} style={[st.title, (cancelled || done) && { textDecorationLine: 'line-through' }]}>{item.title}</T>
        <T variant="small" numberOfLines={1}>
          {cancelled ? 'Entfällt · ' : item.status === 'missed' ? 'Verpasst · ' : ''}
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
});
