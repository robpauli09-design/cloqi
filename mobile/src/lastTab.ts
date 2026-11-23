import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Remembers the last open tab, so the app reopens where you were (like most apps do).
const KEY = 'cloqi.lastTab';
export type TabPath = '/' | '/ai' | '/profil';
const VALID: TabPath[] = ['/', '/ai', '/profil'];

export async function saveLastTab(path: string) {
  const tab = VALID.find(t => t !== '/' && path.startsWith(t)) ?? '/';
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, tab);
    else await SecureStore.setItemAsync(KEY, tab);
  } catch { /* not critical */ }
}

export async function loadLastTab(): Promise<TabPath> {
  try {
    const v = Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return VALID.includes(v as TabPath) ? (v as TabPath) : '/';
  } catch { return '/'; }
}
