import { useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, radius, shadow } from '@/theme';

export function T({ style, variant = 'body', ...p }: React.ComponentProps<typeof Text> & { variant?: 'body' | 'muted' | 'small' | 'label' | 'h1' | 'h2' | 'eyebrow' }) {
  return <Text {...p} style={[s.body, s[variant], style]} />;
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }: {
  title: string; onPress?: PressableProps['onPress']; variant?: 'primary' | 'lime' | 'outline' | 'ghost' | 'danger';
  loading?: boolean; disabled?: boolean; icon?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const v = BTN[variant];
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={e => { void Haptics.selectionAsync(); onPress?.(e); }}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: v.bg, borderColor: v.border }, (disabled || loading) && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon}
      <Text style={[s.btnText, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}
const BTN = {
  primary: { bg: colors.leafDark, fg: colors.white, border: colors.leafDark },
  lime: { bg: colors.lime, fg: colors.leafDeep, border: colors.lime },
  outline: { bg: colors.white, fg: colors.ink, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.inkSoft, border: 'transparent' },
  danger: { bg: colors.white, fg: colors.danger, border: colors.dangerSoft },
};

export function Input({ label, style, ...p }: TextInputProps & { label?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label && <T variant="label">{label}</T>}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        {...p}
        onFocus={e => { setFocus(true); p.onFocus?.(e); }}
        onBlur={e => { setFocus(false); p.onBlur?.(e); }}
        style={[s.input, focus && s.inputFocus, style]}
      />
    </View>
  );
}

/** Segmented buttons (e.g. m/w/d) – same look as on the website. */
export function Segmented<V extends string>({ value, options, onChange }: { value: NoInfer<V> | null; options: { value: NoInfer<V>; label: string }[]; onChange(v: V): void }) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }}
            onPress={() => { void Haptics.selectionAsync(); onChange(o.value); }}
            style={[s.segItem, on && s.segOn]}>
            <Text style={[s.segText, on && { color: colors.leafDark }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Dropdown: a field that opens a bottom sheet with the options (the app version of the website's Select). */
export function Select<V extends string>({ label, value, options, onChange, placeholder = 'Bitte wählen' }: {
  label?: string; value: NoInfer<V> | null; options: { value: NoInfer<V>; label: string }[]; onChange(v: V): void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find(o => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      {label && <T variant="label">{label}</T>}
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [s.input, s.selectField, (pressed || open) && s.inputFocus]} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={[s.selectText, !current && { color: colors.inkFaint }]} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.leafDark} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.grabber} />
          {label && <T variant="h2" style={{ paddingHorizontal: 8, marginBottom: 8 }}>{label}</T>}
          <ScrollView style={{ maxHeight: 420 }}>
            {options.map(o => {
              const on = o.value === value;
              return (
                <Pressable key={o.value} onPress={() => { void Haptics.selectionAsync(); onChange(o.value); setOpen(false); }}
                  style={({ pressed }) => [s.option, (on || pressed) && { backgroundColor: colors.leafSoft }]}>
                  <Text style={[s.optionText, on && { fontFamily: font.bold, color: colors.leafDeep }]}>{o.label}</Text>
                  {on && <Ionicons name="checkmark" size={20} color={colors.leafDark} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export function Pill({ children, color = colors.leafDark, bg = colors.leafSoft }: { children: React.ReactNode; color?: string; bg?: string }) {
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color }]}>{children}</Text></View>;
}

export function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <View style={s.error}><Text style={s.errorText}>{text}</Text></View>;
}

const s = StyleSheet.create({
  body: { fontFamily: font.regular, fontSize: 15, color: colors.ink, lineHeight: 21 } as TextStyle,
  muted: { fontSize: 14, color: colors.inkSoft },
  small: { fontSize: 12, color: colors.inkFaint, lineHeight: 16 },
  label: { fontFamily: font.semibold, fontSize: 12, color: colors.inkSoft },
  h1: { fontFamily: font.display, fontSize: 28, lineHeight: 34, color: colors.ink },
  h2: { fontFamily: font.display, fontSize: 19, lineHeight: 24, color: colors.ink },
  eyebrow: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.inkFaint },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: 18, ...shadow },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18 },
  btnText: { fontFamily: font.bold, fontSize: 15 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  inputFocus: { borderColor: colors.leaf, shadowColor: colors.leaf, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  selectField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectText: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(25,26,23,0.35)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 12, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, borderRadius: radius.md },
  optionText: { fontFamily: font.medium, fontSize: 16, color: colors.ink },
  seg: { flexDirection: 'row', gap: 4, backgroundColor: colors.paper, borderRadius: 18, padding: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14 },
  segOn: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.leaf },
  segText: { fontFamily: font.semibold, fontSize: 14, color: colors.inkSoft },
  pill: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: font.bold, fontSize: 11 },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 12 },
  errorText: { fontFamily: font.medium, color: colors.danger, fontSize: 14 },
});
