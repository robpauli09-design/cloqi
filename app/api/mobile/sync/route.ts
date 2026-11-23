import { autoSyncFor } from '@/lib/auto-sync';
import { json, withUser } from '@/lib/mobile-api';

export const maxDuration = 60;

/** The app calls this when it comes to the front: WebUntis & co. are refreshed if older than 10 minutes. */
export const POST = withUser(async user => json(await autoSyncFor(user)));
