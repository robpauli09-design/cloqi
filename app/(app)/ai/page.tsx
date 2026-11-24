import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { aiConfig } from '@/lib/ai';
import { ensureVault } from '@/lib/vault';
import { Chat } from './Chat';

export const metadata: Metadata = { title: 'CLOQI AI' };
// the agent may call the model several times per message (and think before each step)
export const maxDuration = 120;

export default async function AiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireReadyUser();
  const { q } = await searchParams;
  await ensureVault(user);
  // like ChatGPT/Claude: the AI tab opens with a fresh chat; older chats are in the history
  return <Chat mascot={user.prefs.mascot} name={user.name} aiEnabled={Boolean(aiConfig())} initialText={typeof q === 'string' ? q.slice(0, 500) : undefined} />;
}
