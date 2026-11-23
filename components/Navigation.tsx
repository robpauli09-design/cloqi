'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, BookOpenText, CalendarDays, Flower2, Home, Link2, MessageCircleHeart, Sun, UserRound } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';
import { Mascot, type MascotName } from './Mascot';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/calendar', label: 'Kalender', icon: CalendarDays },
  { href: '/learn', label: 'Learn', icon: BookOpen },
  { href: '/life', label: 'Life', icon: Sun },
  { href: '/ai', label: 'CLOQI AI', icon: MessageCircleHeart },
  { href: '/vault', label: 'Wissen', icon: BookOpenText },
  { href: '/profile', label: 'Profil', icon: UserRound },
];
const CYCLE = { href: '/cycle', label: 'Cycle', icon: Flower2 };

/** Desktop: the profile lives in the account menu at the bottom left, not in the list. */
function useItems(cycle: boolean) {
  const main = NAV.filter(i => i.href !== '/profile');
  return cycle ? [...main, CYCLE] : main;
}

export function Sidebar({ name, email, mascot, cycle }: { name: string; email: string; mascot: MascotName; cycle: boolean }) {
  const path = usePathname();
  const items = useItems(cycle);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-leaf-deep px-4 py-6 text-paper lg:flex">
      <Link href="/dashboard" className="px-2"><Logo light size="sm" /></Link>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Hauptnavigation">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition
                ${active ? 'bg-lime text-leaf-deep shadow-sm' : 'text-paper/75 hover:bg-white/10 hover:text-paper'}`}>
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
      <Link href="/connect" className={`mt-4 flex items-center gap-3 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold transition
        ${path === '/connect' ? 'bg-white/15 text-paper' : 'text-paper/75 hover:bg-white/10 hover:text-paper'}`}>
        <Link2 size={18} /> Kalender verbinden
      </Link>
      <div className="mt-auto">
        <div className="relative mb-3 overflow-hidden rounded-2xl bg-white/10 p-3">
          <Mascot name={mascot} variant="bust" size={72} className="absolute -bottom-3 -right-2 opacity-95" />
          <p className="max-w-[110px] text-xs font-medium leading-snug text-paper/85">Ich halte deinen Tag im Blick.</p>
        </div>
        <AccountMenu name={name} email={email} />
      </div>
    </aside>
  );
}

export function MobileNav({ cycle: _cycle }: { cycle: boolean }) {
  const path = usePathname();
  const items = NAV.filter(i => i.href !== '/vault'); // six main areas; Wissen and Cycle are linked from CLOQI AI, Home and Profil
  return (
    <nav aria-label="Navigation" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-2 pt-1.5 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-lg justify-between">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold ${active ? 'text-leaf-dark' : 'text-ink-faint'}`}>
              <span className={`grid h-8 w-12 place-items-center rounded-full transition ${active ? 'bg-lime/40' : ''}`}><Icon size={20} /></span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
