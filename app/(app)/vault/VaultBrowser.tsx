'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Download, FilePlus2, FileText, Folder, GraduationCap, Link2, Loader2, Lock, Network, Pencil, Save, Search, Trash2, X } from 'lucide-react';
import type { Edge } from '@/lib/vault-links';
import { VaultGraph } from './VaultGraph';
import { ARTEN, FORMAT_LABEL, materialInfo, type Format } from '@/lib/lernmaterial-meta';
import { createVaultNote, deleteVaultFileAction, openVaultFile, saveVaultFile, searchVaultAction } from '@/app/actions/ai';
import { formatDateDe, utcToZoned } from '@/lib/time';
import { Markdown } from '@/components/Markdown';
import { toast, toastResult } from '@/components/Toaster';

interface FileInfo { path: string; updatedBy: string; updatedAt: string; generated: boolean; userWritable: boolean; userDeletable: boolean }

const FOLDER_HINT: Record<string, string> = { 'raw-sources': 'Dein Material · CLOQI liest nur', wiki: 'Gehört CLOQI' };

export function VaultBrowser({ files, initial, tz, edges }: { files: FileInfo[]; initial: string; tz: string; edges: Edge[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(files.some(f => f.path === initial) ? initial : 'user.md');
  const [content, setContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [pending, start] = useTransition();
  const info = files.find(f => f.path === current);
  const [graph, setGraph] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ path: string; excerpt: string }[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(async () => { const r = await searchVaultAction(q).catch(() => []); if (alive) setHits(r); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const shownHits = q.trim().length >= 2 ? hits : null;
  // notes that link here (Obsidian "backlinks") and notes this one links to
  const backlinks = edges.filter(e => e.to === current).map(e => e.from);
  const outgoing = edges.filter(e => e.from === current).map(e => e.to);
  const open = (path: string) => { setCurrent(path); setGraph(false); };

  const load = useCallback((path: string) => {
    setEditing(false);
    setContent(null);
    start(async () => {
      const r = await openVaultFile(path);
      setContent(r.ok ? r.content ?? '' : `_${r.error}_`);
    });
  }, []);
  useEffect(() => { load(current); }, [current, load]);

  const groups = useMemo(() => {
    const g = new Map<string, FileInfo[]>();
    for (const f of files) {
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      g.set(dir, [...(g.get(dir) ?? []), f]);
    }
    return [...g].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  }, [files]);

  const openLink = (target: string) => {
    const t = target.replace(/\.md$/, '');
    const hit = files.find(f => f.path.replace(/\.md$/, '') === t || f.path.replace(/\.md$/, '').endsWith(`/${t}`));
    if (hit) setCurrent(hit.path); else toast(`„${target}“ gibt es (noch) nicht.`, 'info');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit p-3">
        <label className="mb-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm focus-within:border-leaf">
          <Search size={15} className="shrink-0 text-ink-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Im Wissen suchen" aria-label="Im Wissen suchen" className="w-full min-w-0 bg-transparent outline-none" />
          {q && <button type="button" aria-label="Suche leeren" onClick={() => setQ('')}><X size={14} className="text-ink-faint" /></button>}
        </label>
        {shownHits && (
          <div className="mb-3 border-b border-line pb-2">
            {!shownHits.length && <p className="px-2 py-1 text-xs text-ink-soft">Nichts gefunden.</p>}
            {shownHits.map(h => (
              <button key={h.path} onClick={() => open(h.path)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-paper">
                <span className="block truncate text-sm font-semibold">{h.path.split('/').pop()!.replace(/\.md$/, '')}</span>
                <span className="line-clamp-2 block text-[11px] text-ink-soft">{h.excerpt}</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setGraph(g => !g)} aria-pressed={graph}
          className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold ${graph ? 'bg-leaf-soft text-leaf-dark' : 'text-ink-soft hover:bg-paper'}`}>
          <Network size={14} /> Graph-Ansicht
        </button>
        {groups.map(([dir, list]) => (
          <div key={dir || 'root'} className="mb-2">
            {dir && (
              <div className="px-2 pb-1 pt-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft"><Folder size={13} /> {dir}/</p>
                {FOLDER_HINT[dir.split('/')[0]] && dir.split('/').length === 1 && <p className="pl-5 text-[10px] text-ink-faint">{FOLDER_HINT[dir.split('/')[0]]}</p>}
              </div>
            )}
            {list.map(f => (
              <button key={f.path} onClick={() => open(f.path)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${current === f.path ? 'bg-leaf-soft font-semibold text-leaf-dark' : 'hover:bg-paper'} ${dir ? 'pl-5' : ''}`}>
                {f.updatedBy === 'ai' ? <Bot size={14} className="shrink-0 text-ai" /> : <FileText size={14} className="shrink-0 text-ink-faint" />}
                <span className="min-w-0 flex-1 truncate">{f.path.split('/').pop()}</span>
                {!f.userWritable && <Lock size={11} className="shrink-0 text-ink-faint" />}
              </button>
            ))}
          </div>
        ))}
        <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={e => {
          e.preventDefault();
          start(async () => {
            const r = await createVaultNote(newName);
            toastResult(r);
            if (r.ok && r.path) { setNewName(''); router.refresh(); setCurrent(r.path); }
          });
        }}>
          <label className="label" htmlFor="new-note">Neue Notiz</label>
          <input id="new-note" value={newName} onChange={e => setNewName(e.target.value)} maxLength={150} placeholder="raw-sources/Mathe Stoff" className="input py-2" />
          <button className="btn-outline btn-sm w-full" disabled={!newName.trim() || pending}><FilePlus2 size={14} /> Anlegen</button>
        </form>
      </aside>

      {graph ? (
        <section className="card p-5 sm:p-7">
          <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
            <button className="btn-ghost btn-sm !px-2" onClick={() => setGraph(false)} aria-label="Zurück zur Notiz"><ArrowLeft size={16} /></button>
            <h2 className="flex-1 font-display text-lg font-semibold">So hängt dein Wissen zusammen</h2>
            <span className="text-xs text-ink-faint">{files.length} Notizen · {edges.length} Verbindungen</span>
          </div>
          <VaultGraph paths={files.map(f => f.path)} edges={edges} current={current} onOpen={open} />
          <p className="mt-3 text-xs text-ink-faint">Verbinden mit <code>[[Name]]</code> in einer Notiz – CLOQI verlinkt seine Notizen und Lernunterlagen selbst.</p>
        </section>
      ) : (
      <section className="card min-h-[420px] p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{current}</h2>
          {info?.generated && <span className="chip bg-paper text-ink-soft">automatisch erstellt</span>}
          {info && !info.generated && (
            <span className="text-xs text-ink-faint">
              {info.updatedBy === 'ai' ? 'zuletzt von CLOQI' : info.updatedBy === 'user' ? 'zuletzt von dir' : 'Vorlage'} · {formatDateDe(utcToZoned(info.updatedAt, tz).date)}
            </span>
          )}
          {content !== null && !editing && !info?.generated && <DownloadMenu path={current} content={content} />}
          {info?.userWritable && !editing && content !== null && (
            <button className="btn-outline btn-sm" onClick={() => { setDraft(content); setEditing(true); }}><Pencil size={14} /> Bearbeiten</button>
          )}
          {info?.userDeletable && !editing && (
            <button className="btn-danger btn-sm" disabled={pending} onClick={() => {
              if (!window.confirm(`„${current}“ löschen?`)) return;
              start(async () => { const r = await deleteVaultFileAction(current); toastResult(r); if (r.ok) { setCurrent('user.md'); router.refresh(); } });
            }}><Trash2 size={14} /></button>
          )}
        </div>
        {content === null ? <Loader2 className="animate-spin text-leaf" /> : editing ? (
          <div className="space-y-3">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={18} className="input font-mono text-[13px] leading-relaxed" aria-label="Inhalt" />
            <div className="flex gap-2">
              <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
                const r = await saveVaultFile(current, draft);
                toastResult(r);
                if (r.ok) { setContent(draft); setEditing(false); router.refresh(); }
              })}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Speichern</button>
              <button className="btn-ghost" onClick={() => setEditing(false)}><X size={15} /> Abbrechen</button>
            </div>
            <p className="text-xs text-ink-faint">Markdown: # Überschrift, - Liste, **fett**, [[Wiki-Link]]</p>
          </div>
        ) : <>
          <Markdown text={content} onLink={openLink} />
          {(backlinks.length > 0 || outgoing.length > 0) && (
            <div className="mt-8 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
              {[['Verlinkt von', backlinks], ['Verweist auf', outgoing]].map(([label, list]) => (list as string[]).length > 0 && (
                <div key={label as string}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-faint"><Link2 size={12} /> {label as string} ({(list as string[]).length})</p>
                  <ul className="space-y-1">
                    {(list as string[]).map(p => (
                      <li key={p}><button onClick={() => open(p)} className="text-left font-semibold text-leaf-dark underline decoration-leaf/40 underline-offset-2 hover:decoration-leaf">{p.split('/').pop()!.replace(/\.md$/, '')}</button> <span className="text-xs text-ink-faint">{p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>}
      </section>
      )}
    </div>
  );
}

/** Download a note – learning materials in the formats that fit them (PDF, Word, PowerPoint, Anki/Quizlet, Excel). */
function DownloadMenu({ path, content }: { path: string; content: string }) {
  const material = materialInfo(content);
  const formats: Format[] = material ? [...ARTEN[material.art].formats] : ['pdf', 'docx', 'md'];
  const href = (f: Format, extra = '') => `/api/vault/download?path=${encodeURIComponent(path)}&format=${f}${extra}`;
  const test = material && (material.art === 'uebungstest' || material.art === 'uebungsblatt') && /^##\s*(Lösung|Loesung)/im.test(content);
  return (
    <details className="group relative">
      <summary className="btn-outline btn-sm cursor-pointer list-none"><Download size={14} /> Herunterladen</summary>
      <div className="absolute right-0 z-20 mt-1 w-60 animate-pop rounded-2xl border border-line bg-white p-1.5 shadow-lift">
        {material && <p className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-xs font-semibold text-leaf-dark"><GraduationCap size={13} /> {ARTEN[material.art].label} · {material.fach}</p>}
        {formats.map(f => (
          <a key={f} href={href(f)} className="block rounded-xl px-3 py-2 text-sm hover:bg-leaf-soft hover:text-leaf-deep">{FORMAT_LABEL[f]}</a>
        ))}
        {test && <a href={href('pdf', '&loesungen=0')} className="block rounded-xl px-3 py-2 text-sm hover:bg-leaf-soft hover:text-leaf-deep">PDF ohne Lösungen</a>}
      </div>
    </details>
  );
}
