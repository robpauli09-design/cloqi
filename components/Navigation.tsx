'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, BookOpenText, CalendarDays, Flower2, Home, Link2, MessageCircleHeart, PanelLeftClose, PanelLeftOpen, Sun, UserRound } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';
import { Mascot, type MascotName } from './Mascot';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';

// CLOQI AI right after Home – it is the heart of the app
const NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/ai', label: 'CLOQI AI', icon: MessageCircleHeart },
  { href: '/calendar', label: 'Kalender', icon: CalendarDays },
  { href: '/learn', label: 'Learn', icon: BookOpen },
  { href: '/life', label: 'Life', icon: Sun },
  { href: '/vault', label: 'Wissen', icon: BookOpenText },
  { href: '/profile', label: 'Profil', icon: UserRound },
];
const CYCLE = { href: '/cycle', label: 'Cycle', icon: Flower2 };

/** Desktop: the profile lives in the account menu at the bottom left, not in the list. */
function useItems(cycle: boolean) {
  const main = NAV.filter(i => i.href !== '/profile');
  return cycle ? [...main, CYCLE] : main;
}

type NavProps = { name: string; email: string; mascot: MascotName; cycle: boolean };

/** Desktop frame: the sidebar can be collapsed to an icon rail (like ChatGPT/Claude); remembered in a cookie. */
export function AppFrame({ nav, collapsed: initial, children }: { nav: NavProps; collapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initial);
  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  }, [collapsed]);
  // Ctrl/Cmd + B toggles the sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); setCollapsed(c => !c); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={`min-h-dvh transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]'}`}>
      <Sidebar {...nav} collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      {children}
    </div>
  );
}

function Sidebar({ name, email, mascot, cycle, collapsed, onToggle }: NavProps & { collapsed: boolean; onToggle(): void }) {
  const path = usePathname();
  const items = useItems(cycle);
  const toggleLabel = collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen';
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleBtn = (
    <button type="button" onClick={onToggle} aria-label={toggleLabel} title={`${toggleLabel} (Strg+B)`} aria-expanded={!collapsed}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-paper/70 transition hover:bg-white/10 hover:text-paper">
      <ToggleIcon size={19} />
    </button>
  );
  const row = `flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition ${collapsed ? 'justify-center px-0' : 'px-3'}`;
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-leaf-deep py-6 text-paper transition-[width] duration-200 lg:flex
      ${collapsed ? 'w-[72px] px-3' : 'w-[248px] px-4'}`}>
      {collapsed
        ? <div className="flex justify-center">{toggleBtn}</div>
        : <div className="flex items-center justify-between gap-2"><Link href="/dashboard" className="px-2"><Logo light size="sm" /></Link>{toggleBtn}</div>}
      <nav className="mt-8 flex flex-col gap-1" aria-label="Hauptnavigation">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} aria-label={collapsed ? label : undefined} title={collapsed ? label : undefined}
              className={`group ${row} ${active ? 'bg-lime text-leaf-deep shadow-sm' : 'text-paper/75 hover:bg-white/10 hover:text-paper'}`}>
              <Icon size={19} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>
      <Link href="/connect" aria-label={collapsed ? 'Kalender verbinden' : undefined} title={collapsed ? 'Kalender verbinden' : undefined}
        className={`mt-4 border border-white/15 ${row} ${path === '/connect' ? 'bg-white/15 text-paper' : 'text-paper/75 hover:bg-white/10 hover:text-paper'}`}>
        <Link2 size={18} className="shrink-0" />{!collapsed && 'Kalender verbinden'}
      </Link>
      <div className="mt-auto">
        {!collapsed && (
          <div className="relative mb-3 overflow-hidden rounded-2xl bg-white/10 p-3">
            <Mascot name={mascot} variant="bust" size={72} className="absolute -bottom-3 -right-2 opacity-95" />
            <p className="max-w-[110px] text-xs font-medium leading-snug text-paper/85">Ich halte deinen Tag im Blick.</p>
          </div>
        )}
        <AccountMenu name={name} email={email} compact={collapsed} />
      </div>
    </aside>
  );
}

/**
 * Phone: three tabs only – Kalender (incl. Heute, Lernen, Life), CLOQI AI in the middle, Profil
 * (incl. Wissen, Kalender verbinden, Cycle). Same structure as the Expo app.
 */
const CAL_GROUP = ['/dashboard', '/calendar', '/learn', '/life'];
const PROFILE_GROUP = ['/profile', '/connect', '/vault', '/cycle'];
const inGroup = (path: string, group: string[]) => group.some(h => path === h || path.startsWith(`${h}/`));

export function MobileNav({ mascot }: { mascot: MascotName }) {
  const path = usePathname();
  const ai = path === '/ai' || path.startsWith('/ai/');
  const tab = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold ${active ? 'text-leaf-dark' : 'text-ink-faint'}`}>
      <span className={`grid h-8 w-14 place-items-center rounded-full transition ${active ? 'bg-lime/40' : ''}`}><Icon size={21} strokeWidth={active ? 2.4 : 2} /></span>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Navigation" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-6 pt-1 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-sm items-end justify-between">
        {tab('/dashboard', 'Kalender', CalendarDays, inGroup(path, CAL_GROUP))}
        <Link href="/ai" aria-current={ai ? 'page' : undefined} aria-label="CLOQI AI"
          className="flex flex-1 flex-col items-center gap-0.5 pb-1.5 text-[11px] font-semibold">
          <span className={`-mt-7 grid h-16 w-16 place-items-center rounded-full border-4 border-white shadow-lift transition active:scale-95 ${ai ? 'bg-leaf-dark' : 'bg-leaf'}`}>
            <Mascot name={mascot} variant="head" size={46} />
          </span>
          <span className={ai ? 'text-leaf-dark' : 'text-ink-faint'}>CLOQI AI</span>
        </Link>
        {tab('/profile', 'Profil', UserRound, inGroup(path, PROFILE_GROUP))}
      </div>
    </nav>
  );
}

const SECTIONS = [
  { href: '/dashboard', label: 'Heute' },
  { href: '/calendar', label: 'Kalender' },
  { href: '/learn', label: 'Lernen' },
  { href: '/life', label: 'Life' },
];

/** Phone only: switch between the parts of the Kalender tab. */
export function MobileSectionTabs() {
  const path = usePathname();
  if (!inGroup(path, CAL_GROUP)) return null;
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 lg:hidden">
      <div className="flex w-max min-w-full gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-line">
        {SECTIONS.map(s => {
          const active = path === s.href || path.startsWith(`${s.href}/`);
          return (
            <Link key={s.href} href={s.href} aria-current={active ? 'page' : undefined}
              className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-center text-sm font-semibold transition ${active ? 'bg-leaf-dark text-white shadow-sm' : 'text-ink-soft'}`}>
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
