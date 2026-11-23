import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Item } from '@/api';
import { categoryColor, categorySoft, colors, font, itemMark, MARK_STYLE, radius } from '@/theme';
import { T } from './ui';

// Day view with an hour grid (like Google Calendar): tap an entry to open it, tap an empty
// spot to create an event at that time, swipe left/right for the next/previous day.

const HOUR = 56;
const GUTTER = 48;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

interface Placed { item: Item; top: number; height: number; col: number; cols: number }

/** Side-by-side columns for overlapping entries. */
function layout(items: Item[], date: string): Placed[] {
  const timed = items.filter(i => !i.allDay).map(i => {
    const s = i.date < date ? 0 : toMin(i.start);
    const e = (i as Item & { endDate?: string }).endDate && (i as Item & { endDate?: string }).endDate! > date ? 24 * 60 : Math.max(toMin(i.end), s + 15);
    return { item: i, s, e };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Placed[] = [];
  let cluster: { item: Item; s: number; e: number; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map(c => c.col + 1));
    for (const c of cluster) out.push({ item: c.item, top: (c.s / 60) * HOUR, height: Math.max(22, ((c.e - c.s) / 60) * HOUR - 2), col: c.col, cols });
    cluster = [];
  };
  for (const t of timed) {
    if (t.s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter(c => c.e > t.s).map(c => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...t, col });
    clusterEnd = Math.max(clusterEnd, t.e);
  }
  if (cluster.length) flush();
  return out;
}

export function DayView({ date, today, items, onOpen, onCreate, onSwipe }: {
  date: string; today: string; items: Item[];
  onOpen(i: Item): void; onCreate(date: string, start: string): void; onSwipe(dir: 1 | -1): void;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const grid = useRef<React.ComponentRef<typeof View>>(null);
  const placed = useMemo(() => layout(items, date), [items, date]);
  const allDay = items.filter(i => i.allDay);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  useEffect(() => {
    const first = placed.length ? Math.min(...placed.map(p => p.top)) : (date === today ? (nowMin / 60) * HOUR : 7 * HOUR);
    const y = Math.max(0, Math.min(first, date === today ? (nowMin / 60) * HOUR : first) - HOUR * 1.2);
    setTimeout(() => scroll.current?.scrollTo({ y, animated: false }), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_e, g) => { if (Math.abs(g.dx) > 60) onSwipe(g.dx < 0 ? 1 : -1); },
  }), [onSwipe]);

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      {allDay.length > 0 && (
        <View style={st.allDay}>
          {allDay.map(i => <Entry key={i.key} item={i} onOpen={onOpen} compact />)}
        </View>
      )}
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ height: 24 * HOUR, flexDirection: 'row' }}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, h) => (
              <T key={h} variant="small" style={[st.hour, { top: h * HOUR - 7 }]}>{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</T>
            ))}
          </View>
          <Pressable
            ref={grid}
            style={{ flex: 1 }}
            accessibilityLabel="Leere Stelle – neuen Termin anlegen"
            onPress={e => {
              // position of the tap inside the hour grid → time (30-minute steps)
              const pageY = e.nativeEvent.pageY;
              grid.current?.measure((_x, _y, _w, _h, _px, py) => {
                const y = Number.isFinite(pageY - py) ? pageY - py : e.nativeEvent.locationY;
                const min = Math.max(0, Math.min(23 * 60, Math.floor(((Number.isFinite(y) ? y : 7 * HOUR) / HOUR) * 2) * 30));
                onCreate(date, hhmm(min));
              });
            }}
          >
            {Array.from({ length: 24 }, (_, h) => <View key={h} style={[st.line, { top: h * HOUR }]} />)}
            {placed.map(p => (
              <View key={p.item.key} style={{ position: 'absolute', top: p.top, height: p.height, left: `${(p.col / p.cols) * 100}%`, width: `${100 / p.cols}%`, paddingRight: 3 }}>
                <Entry item={p.item} onOpen={onOpen} height={p.height} />
              </View>
            ))}
            {date === today && (
              <View pointerEvents="none" style={[st.now, { top: (nowMin / 60) * HOUR }]}>
                <View style={st.nowDot} />
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Entry({ item, onOpen, height, compact }: { item: Item; onOpen(i: Item): void; height?: number; compact?: boolean }) {
  const mark = itemMark(item);
  const ms = mark ? MARK_STYLE[mark] : null;
  const color = ms?.color ?? categoryColor[item.category] ?? colors.leafDark;
  const small = (height ?? 40) < 38;
  return (
    <Pressable onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.allDay ? 'ganztägig' : `${item.start} bis ${item.end}`}`}
      style={({ pressed }) => [st.entry, compact ? st.entryCompact : { flex: 1 }, { backgroundColor: ms?.soft ?? categorySoft[item.category] ?? colors.leafSoft, borderLeftColor: color },
        mark === 'cancelled' && st.cancelled, item.status === 'done' && { opacity: 0.55 }, pressed && { opacity: 0.75 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {ms && !small && <View style={[st.badge, { backgroundColor: ms.color }]}><T style={st.badgeText}>{ms.label}</T></View>}
        <T numberOfLines={1} style={[st.entryTitle, { color: ms?.text ?? colors.ink }, (mark === 'cancelled' || item.status === 'done') && { textDecorationLine: 'line-through' }]}>{item.title}</T>
      </View>
      {!small && !compact && <T numberOfLines={1} style={st.entryMeta}>{item.start}–{item.end}{item.location ? ` · ${item.location}` : ''}</T>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  allDay: { gap: 4, paddingHorizontal: 12, paddingBottom: 6, paddingLeft: GUTTER },
  hour: { position: 'absolute', right: 8, fontSize: 11 },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  entry: { borderRadius: radius.sm, borderLeftWidth: 3, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' },
  entryCompact: { paddingVertical: 6 },
  cancelled: { borderWidth: 1, borderStyle: 'dashed', borderColor: MARK_STYLE.cancelled.color, borderLeftWidth: 3 },
  entryTitle: { flexShrink: 1, fontFamily: font.bold, fontSize: 12.5 },
  entryMeta: { fontFamily: font.medium, fontSize: 11, color: colors.inkSoft },
  badge: { borderRadius: 4, paddingHorizontal: 4 },
  badgeText: { color: colors.white, fontFamily: font.bold, fontSize: 8.5, lineHeight: 13, textTransform: 'uppercase' },
  now: { position: 'absolute', left: -4, right: 0, height: 2, backgroundColor: colors.danger },
  nowDot: { position: 'absolute', left: -2, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
});
