import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/auth';
import { Mascot } from './Mascot';
import { colors, font, shadow } from '@/theme';

/** Three tabs, like the website on the phone: Kalender · CLOQI AI (raised, mascot) · Profil. */
export function TabBar() {
  const path = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const go = (href: '/' | '/ai' | '/profil') => { void Haptics.selectionAsync(); router.navigate(href); };
  const ai = path.startsWith('/ai');
  const profil = path.startsWith('/profil');
  const kalender = !ai && !profil;

  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <Tab label="Kalender" icon={kalender ? 'calendar' : 'calendar-outline'} active={kalender} onPress={() => go('/')} />
      <Pressable onPress={() => go('/ai')} style={st.center} accessibilityRole="tab" accessibilityLabel="CLOQI AI" accessibilityState={{ selected: ai }}>
        <View style={[st.bubble, { backgroundColor: ai ? colors.leafDark : colors.leaf }]}>
          <Mascot name={user?.mascot ?? 'cloki'} variant="head" size={46} />
        </View>
        <Text style={[st.label, ai && st.labelOn]}>CLOQI AI</Text>
      </Pressable>
      <Tab label="Profil" icon={profil ? 'person-circle' : 'person-circle-outline'} active={profil} onPress={() => go('/profil')} />
    </View>
  );
}

function Tab({ label, icon, active, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; active: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={st.tab} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }}>
      <View style={[st.iconWrap, active && { backgroundColor: 'rgba(164,217,45,0.4)' }]}>
        <Ionicons name={icon} size={23} color={active ? colors.leafDark : colors.inkFaint} />
      </View>
      <Text style={[st.label, active && st.labelOn]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6, paddingHorizontal: 28 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  iconWrap: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.semibold, fontSize: 11, color: colors.inkFaint },
  labelOn: { color: colors.leafDark },
  center: { flex: 1, alignItems: 'center', gap: 2 },
  bubble: { marginTop: -30, width: 66, height: 66, borderRadius: 33, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow },
});
