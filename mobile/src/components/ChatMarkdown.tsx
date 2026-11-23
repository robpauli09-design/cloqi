import { View } from 'react-native';
import { colors, font } from '@/theme';
import { T } from './ui';

// Light Markdown for CLOQI AI answers (same idea as the website's components/Markdown.tsx compact mode):
// **bold**, *italic* / _italic_, `code`, "- " lists, headings as bold lines. Never shows the raw stars.

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2] || m[3]) out.push(<T key={k} style={{ fontFamily: font.bold }}>{m[2] ?? m[3]}</T>);
    else if (m[4]) out.push(<T key={k} style={{ fontFamily: font.medium, backgroundColor: colors.paper }}>{m[4]}</T>);
    else out.push(<T key={k} style={{ fontStyle: 'italic' }}>{m[5] ?? m[6]}</T>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ChatMarkdown({ text, cursor }: { text: string; cursor?: boolean }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) { if (blocks.length) blocks.push(<View key={`s${i}`} style={{ height: 6 }} />); return; }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    const isLast = i === lines.length - 1;
    const tail = cursor && isLast ? <T style={{ color: colors.leaf }}> ▍</T> : null;
    if (h) blocks.push(<T key={i} style={{ fontFamily: font.bold }}>{inline(h[1], `h${i}`)}{tail}</T>);
    else if (li) blocks.push(
      <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 2 }}>
        <T style={{ color: colors.leaf }}>•</T>
        <T style={{ flex: 1 }}>{inline(li[1], `l${i}`)}{tail}</T>
      </View>,
    );
    else blocks.push(<T key={i}>{inline(line, `p${i}`)}{tail}</T>);
  });
  if (cursor && (!lines.length || !lines[lines.length - 1].trim())) blocks.push(<T key="cursor" style={{ color: colors.leaf }}>▍</T>);
  return <View style={{ gap: 2 }}>{blocks}</View>;
}
