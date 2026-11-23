'use client';

import Image from 'next/image';
import { useState } from 'react';

export type MascotName = 'cloki' | 'clea';

/** Mascots whose image files exist in /public/mascot. Add 'clea' once clea-full/bust/head.png are there. */
export const AVAILABLE_MASCOTS: MascotName[] = ['cloki'];
export const mascotReady = (n: MascotName) => AVAILABLE_MASCOTS.includes(n);
type Variant = 'full' | 'bust' | 'head';

const SIZES: Record<Variant, { w: number; h: number }> = {
  full: { w: 415, h: 757 },
  bust: { w: 415, h: 378 },
  head: { w: 302, h: 302 },
};

/**
 * The CLOQI mascot (Cloki, or Clea if chosen). Falls back to Cloki when an image is missing.
 * `message` renders a speech bubble next to it.
 */
export function Mascot({
  name = 'cloki', variant = 'bust', size = 120, message, className = '', float = false, priority = false, bubbleSide = 'right',
}: {
  name?: MascotName; variant?: Variant; size?: number; message?: React.ReactNode; className?: string;
  float?: boolean; priority?: boolean; bubbleSide?: 'right' | 'top';
}) {
  const [failed, setFailed] = useState(false);
  const file = mascotReady(name) && !failed ? name : 'cloki';
  const src = `/mascot/${file}-${variant}.png`;
  const { w, h } = SIZES[variant];
  const label = name === 'clea' ? 'Clea' : 'Cloki';
  const img = (
    <Image
      src={src} alt={`${label}, das CLOQI-Chamäleon`} width={w} height={h} priority={priority}
      style={{ width: size, height: 'auto' }}
      className={`select-none drop-shadow-[0_8px_16px_rgba(25,69,31,.18)] ${variant === 'head' ? 'rounded-full bg-leaf-soft' : ''} ${float ? 'animate-floaty' : ''}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
  if (!message) return <div className={className}>{img}</div>;
  return (
    <div className={`flex ${bubbleSide === 'top' ? 'flex-col-reverse items-center' : 'items-end'} gap-3 ${className}`}>
      <div className="shrink-0">{img}</div>
      <div className="relative mb-4 max-w-xs animate-pop rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm font-medium text-ink shadow-lift border border-line/60">
        {message}
      </div>
    </div>
  );
}

export function MascotAvatar({ name = 'cloki', size = 36 }: { name?: MascotName; size?: number }) {
  return <Mascot name={name} variant="head" size={size} />;
}
