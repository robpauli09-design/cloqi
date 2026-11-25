import { Bone, SkeletonPage } from '@/components/Skeleton';

/** Like the real calendar: sidebar (xl), header with view switch, week grid on desktop / day grid on phones. */
export default function Loading() {
  return (
    <SkeletonPage className="flex gap-6">
      <aside className="hidden w-60 shrink-0 xl:block">
        <div className="card space-y-4 p-4">
          <Bone className="h-3 w-28" />
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3"><Bone className="h-4 w-4 rounded" /><div className="flex-1 space-y-1.5"><Bone className="h-3.5 w-24" /><Bone className="h-2.5 w-16" /></div></div>
          ))}
          <Bone className="h-8 w-full rounded-xl" />
          <Bone className="!mt-6 h-3 w-24" />
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-2"><Bone className="h-2.5 w-2.5 rounded-full" /><Bone className="h-3 w-20" /></div>)}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="mb-4 flex flex-wrap items-center gap-2 lg:gap-3">
          <div className="mr-auto space-y-2">
            <Bone className="hidden h-3 w-28 lg:block" />
            <Bone className="h-7 w-56 lg:h-9 lg:w-80" />
          </div>
          <Bone className="order-last h-10 w-full rounded-xl lg:order-none lg:w-[272px]" />
          <Bone className="h-9 w-[132px] rounded-xl" />
          {/* search, KI-Planung, Neuer Termin – they wrap into a second row exactly like the real header */}
          <Bone className="hidden h-10 w-[210px] rounded-xl sm:block" />
          <Bone className="hidden h-10 w-[132px] rounded-xl lg:block" />
          <Bone className="hidden h-10 w-[144px] rounded-xl lg:block" />
        </header>
        {/* desktop opens the week, phones the day (CalendarApp switches below 1024px) */}
        <Grid days={7} className="hidden lg:block" />
        <Grid days={1} className="lg:hidden" />
      </div>
    </SkeletonPage>
  );
}

function Grid({ days, className }: { days: number; className: string }) {
  const cols = days === 7 ? 'grid-cols-[52px_repeat(7,1fr)]' : 'grid-cols-[52px_1fr]';
  return (
    <div className={`card overflow-hidden !p-0 ${className}`}>
      <div className={`grid ${cols} border-b border-line`}>
        <div />
        {Array.from({ length: days }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 border-l border-line py-3"><Bone className="h-2.5 w-6" /><Bone className="h-6 w-6 rounded-full" /></div>
        ))}
      </div>
      <div className={`grid h-[calc(100dvh-16rem)] min-h-[420px] ${cols} overflow-hidden`}>
        <div className="space-y-[38.5px] pt-2">{Array.from({ length: 14 }, (_, i) => <Bone key={i} className="mx-auto h-2.5 w-8" />)}</div>
        {Array.from({ length: days }, (_, i) => (
          <div key={i} className="border-l border-line bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,#E6E4DA_47px,#E6E4DA_48px)]" />
        ))}
      </div>
    </div>
  );
}
