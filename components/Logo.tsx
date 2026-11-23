import Image from 'next/image';

export function Logo({ light = false, size = 'md' }: { light?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-2xl';
  const img = size === 'lg' ? 48 : size === 'sm' ? 28 : 36;
  return (
    <span className="inline-flex items-center gap-2">
      <Image src="/mascot/cloki-head.png" alt="" width={img} height={img} className="rounded-full bg-lime/30" />
      <span className={`font-display font-bold tracking-tight ${text} ${light ? 'text-paper' : 'text-leaf-deep'}`}>
        CLO<span className={light ? 'text-lime' : 'text-leaf'}>Q</span>I
      </span>
    </span>
  );
}
