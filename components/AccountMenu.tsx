'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, Clock, Download, Link2, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { logout } from '@/app/actions/auth';

const ITEMS = [
  [
    { href: '/profile#profil', label: 'Profil', icon: UserRound },
    { href: '/profile#lernzeiten', label: 'Lernzeiten & Fächer', icon: Clock },
    { href: '/profile#benachrichtigungen', label: 'Benachrichtigungen', icon: Bell },
    { href: '/connect', label: 'Kalender verbinden', icon: Link2 },
  ],
  [
    { href: '/api/export', label: 'Daten exportieren', icon: Download, download: true },
    { href: '/profile#konto', label: 'Datenschutz & Konto', icon: ShieldCheck },
  ],
] as const;

/** Account button at the bottom of the sidebar; opens a menu to everything around the account. */
export function AccountMenu({ name, email, compact = false }: { name: string; email: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLElement>('button[aria-haspopup]')?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink outline-none transition hover:bg-leaf-soft hover:text-leaf-deep focus-visible:bg-leaf-soft focus-visible:text-leaf-deep';

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      {open && (
        <div ref={menu} role="menu" aria-label="Konto"
          className={`absolute animate-pop rounded-2xl border border-line bg-white p-1.5 text-ink shadow-lift
            ${compact ? 'bottom-0 left-full ml-3 w-60 origin-bottom-left' : 'bottom-full left-0 right-0 mb-2 origin-bottom'}`}>
          <p className="truncate px-3 pb-1.5 pt-2 text-xs font-medium text-ink-faint">{email}</p>
          {ITEMS.map((group, gi) => (
            <div key={gi} className={gi ? 'mt-1 border-t border-line pt-1' : ''}>
              {group.map(({ href, label, icon: Icon, ...rest }) => 'download' in rest
                ? <a key={href} href={href} role="menuitem" className={item}><Icon size={17} className="text-leaf-dark" />{label}</a>
                : <Link key={href} href={href} role="menuitem" className={item} onClick={() => setOpen(false)}><Icon size={17} className="text-leaf-dark" />{label}</Link>)}
            </div>
          ))}
          <form action={logout} className="mt-1 border-t border-line pt-1">
            <button role="menuitem" className={`${item} hover:!bg-danger-soft hover:!text-danger focus-visible:!bg-danger-soft focus-visible:!text-danger`}>
              <LogOut size={17} /> Abmelden
            </button>
          </form>
        </div>
      )}
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        aria-label={compact ? `Konto & Einstellungen (${name})` : undefined} title={compact ? name : undefined}
        className={`flex w-full items-center gap-2 rounded-xl py-2 text-left transition ${compact ? 'justify-center px-0' : 'px-2'} ${open ? 'bg-white/15' : 'hover:bg-white/10'}`}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime font-display font-bold text-leaf-deep">{name.slice(0, 1).toUpperCase()}</span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-paper/60">Konto & Einstellungen</span>
          </span>
        )}
      </button>
    </div>
  );
}
