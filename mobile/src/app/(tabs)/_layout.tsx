import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';
import { loadLastTab, saveLastTab } from '@/lastTab';
import { syncSoon } from '@/sync';
import { colors } from '@/theme';

export default function TabsLayout() {
  const path = usePathname();
  const router = useRouter();
  const started = useRef(false);
  const restored = useRef(false); // only save once the stored tab was read (else '/' would overwrite it)

  // reopen the tab you were on last time (Kalender, CLOQI AI or Profil)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadLastTab().then(tab => {
      restored.current = true;
      if (tab !== '/') router.navigate(tab);
    });
  }, [router]);
  useEffect(() => { if (restored.current) void saveLastTab(path); }, [path]);
  // WebUntis changes (e.g. a lesson cancelled at short notice) show up when the app is opened again
  useEffect(() => {
    void syncSoon();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void syncSoon(); });
    return () => sub.remove();
  }, []);

  return (
    <Tabs tabBar={() => <TabBar />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}>
      <Tabs.Screen name="index" options={{ title: 'Kalender' }} />
      <Tabs.Screen name="ai" options={{ title: 'CLOQI AI' }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
