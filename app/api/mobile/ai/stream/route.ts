import { streamChat } from '@/lib/ai-stream';
import { body, withUser } from '@/lib/mobile-api';

// the agent may call the model several times per message (and think before each step)
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** App: one CLOQI AI message, answer streamed as NDJSON. Body like POST /api/mobile/ai. */
export const POST = withUser(async (user, req) => streamChat(user, await body(req, 4_500_000)));
