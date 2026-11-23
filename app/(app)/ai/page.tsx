import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { Chat } from './Chat';

export const metadata: Metadata = { title: 'CLOQI AI' };

export default async function AiPage() {
  const user = await requireReadyUser();
  return <Chat mascot={user.prefs.mascot} name={user.name} />;
}
