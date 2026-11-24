import 'server-only';
import { isConfigured, syncProvider } from './integrations';
import { detectMissedBlocks } from './planning';
import { listConnections } from './repo';
import type { User } from './types';
import { UNTIS_IMPORT_VERSION } from './untis-public';
import { syncWebUntis } from './webuntis';
import { SCHOOL_SYNC_EVERY_MS, syncSchool } from './school';

/** WebUntis is re-checked whenever the website or app is opened and the last check is older than this. */
export const SYNC_EVERY_MS = 10 * 60000;

/**
 * Refreshes stale connections (WebUntis, Google, Outlook) and detects missed study blocks.
 * Called when the website is opened (components/BackgroundTasks) and when the app comes to the front.
 */
export async function autoSyncFor(user: User): Promise<{ changed: boolean }> {
  const stale = (iso: string | null) => !iso || Date.now() - Date.parse(iso) > SYNC_EVERY_MS;
  let changed = false;
  for (const c of await listConnections(user.id)) {
    // a newer WebUntis import (e.g. better exam detection) is applied to existing connections right away
    const outdated = c.provider === 'webuntis' && c.config.untis && (c.config.untis.version ?? 0) < UNTIS_IMPORT_VERSION;
    if (c.provider === 'school') {
      // Teams/OneNote change less often – every 30 minutes is plenty
      if (c.status !== 'expired' && isConfigured('school') && (!c.lastSyncAt || Date.now() - Date.parse(c.lastSyncAt) > SCHOOL_SYNC_EVERY_MS)) {
        try { const r = await syncSchool(user); if (r.newTasks) changed = true; } catch { /* stored on the connection */ }
      }
      continue;
    }
    if ((!stale(c.lastSyncAt) && !outdated) || c.status === 'expired') continue;
    try {
      if (c.provider === 'webuntis') { await syncWebUntis(user); changed = true; }
      if ((c.provider === 'google' || c.provider === 'outlook') && isConfigured(c.provider)) { await syncProvider(user, c.provider); changed = true; }
    } catch { /* status and error are stored on the connection */ }
  }
  await detectMissedBlocks(user);
  return { changed };
}
