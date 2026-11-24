import type { Metadata } from 'next';
import { requireReadyUser } from '@/lib/auth';
import { readVault } from '@/lib/vault';
import { Mascot } from '@/components/Mascot';
import { VaultBrowser } from './VaultBrowser';
import { linkEdges } from '@/lib/vault-links';

export const metadata: Metadata = { title: 'Wissen' };

export default async function VaultPage({ searchParams }: { searchParams: Promise<{ file?: string; view?: string }> }) {
  const user = await requireReadyUser();
  const files = await readVault(user);
  const { file, view } = await searchParams;
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="flex-1">
          <p className="eyebrow">Wissen</p>
          <h1 className="h1">Dein Vault</h1>
          <p className="muted mt-1 max-w-2xl">Hier merkt sich CLOQI, wer du bist und wie du arbeitest – wie ein Obsidian-Vault. Du siehst jederzeit alles und entscheidest, was bleibt.</p>
        </div>
        <Mascot name={user.prefs.mascot} variant="bust" size={96} className="hidden sm:block" />
      </header>
      <VaultBrowser files={files.map(f => ({ path: f.path, updatedBy: f.updatedBy, updatedAt: f.updatedAt, generated: f.generated, userWritable: f.userWritable, userDeletable: f.userDeletable }))}
        initial={file ?? 'user.md'} tz={user.timezone} edges={linkEdges(files)} graphFirst={view === 'graph'} />
    </div>
  );
}
