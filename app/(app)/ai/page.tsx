import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { aiConfig } from '@/lib/ai';
import { listChat } from '@/lib/repo';
import { ensureVault } from '@/lib/vault';
import { Chat } from './Chat';

export const metadata: Metadata = { title: 'CLOQI AI' };
// the agent may call the model several times per message
export const maxDuration = 60;

export default async function AiPage() {
  const user = await requireReadyUser();
  await ensureVault(user);
  const history = await listChat(user.id, 40);
  return (
    <Chat mascot={user.prefs.mascot} name={user.name} aiEnabled={Boolean(aiConfig())}
      history={history.map(m => ({ id: m.id, from: m.role === 'user' ? 'user' : 'cloqi', text: m.content }))} />
  );
}
