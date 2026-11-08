// The product was called KLOQI before it became CLOQI. Browsers that used the
// old build still hold their login, demo state and demo budget under "kloqi"
// keys; move them once so nobody is logged out or loses their demo progress.
export function migrateLegacyStorage(storage: Storage = localStorage) {
  try {
    const legacy: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (name?.startsWith("kloqi")) legacy.push(name);
    }
    for (const name of legacy) {
      const renamed = "cloqi" + name.slice("kloqi".length);
      const value = storage.getItem(name);
      if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value);
      storage.removeItem(name);
    }
  } catch {
    /* Storage unavailable: the app works without persisted state. */
  }
}
