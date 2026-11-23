'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Remembers the current area (not sensitive: only the page path) so the site reopens there. */
export function RememberPath() {
  const path = usePathname();
  useEffect(() => {
    if (/^\/(dashboard|calendar|learn|life|ai|vault|profile|connect|cycle)$/.test(path)) {
      document.cookie = `cloqi_last=${path}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    }
  }, [path]);
  return null;
}
