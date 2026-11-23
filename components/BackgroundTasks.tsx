'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { upcomingReminders, type ReminderItem } from '@/app/actions/calendar';
import { autoSync } from '@/app/actions/settings';
import { toast } from './Toaster';
import type { MascotName } from './Mascot';

/**
 * Runs while the app is open:
 * - refreshes stale calendar connections and detects missed study blocks
 * - shows reminders in the app and – if allowed – as browser notifications.
 * Real push notifications (app closed) follow with the native apps.
 */
export function BackgroundTasks({ mascot }: { mascot: MascotName }) {
  const router = useRouter();
  const reminders = useRef<ReminderItem[]>([]);

  useEffect(() => {
    let alive = true;
    let lastSync = Date.now();
    autoSync().then(r => { if (alive && r.changed) router.refresh(); }).catch(() => undefined);
    // back to the tab/app (e.g. phone unlocked): check WebUntis & co. again (server only refreshes if > 10 min old)
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastSync < 60_000) return;
      lastSync = Date.now();
      autoSync().then(r => { if (alive && r.changed) router.refresh(); }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    const load = () => upcomingReminders().then(r => { reminders.current = r; }).catch(() => undefined);
    load();
    const reload = setInterval(load, 5 * 60000);
    const tick = setInterval(() => {
      const now = Date.now();
      let shown: string[] = [];
      try { shown = JSON.parse(localStorage.getItem('cloqi:reminded') || '[]'); } catch { /* storage blocked */ }
      for (const r of reminders.current) {
        if (shown.includes(r.key) || Date.parse(r.remindAt) > now || Date.parse(r.startAt) < now) continue;
        const minutes = Math.max(0, Math.round((Date.parse(r.startAt) - now) / 60000));
        const text = minutes >= 60 * 12 ? `Morgen: ${r.title}` : minutes === 0 ? `${r.title} beginnt jetzt.` : `In ${minutes} Minuten: ${r.title}`;
        toast(text, 'info', true);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification('CLOQI', { body: text, icon: `/mascot/${mascot}-head.png`, tag: r.key }); } catch { /* ignore */ }
        }
        shown = [...shown.slice(-200), r.key];
      }
      try { localStorage.setItem('cloqi:reminded', JSON.stringify(shown)); } catch { /* storage blocked */ }
    }, 30000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible); alive = false; clearInterval(reload); clearInterval(tick); };
  }, [router, mascot]);

  return null;
}
