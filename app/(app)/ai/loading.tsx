import { Bone, SkeletonPage } from '@/components/Skeleton';

/** Empty chat: mascot, greeting, three suggestions, composer at the bottom – exactly where the real ones sit. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex min-h-[calc(100dvh-9.5rem)] max-w-3xl flex-col lg:min-h-[calc(100dvh-4.5rem)]">
      <div className="hidden gap-3 lg:fixed lg:right-7 lg:top-6 lg:flex"><Bone className="h-6 w-6 rounded-full" /><Bone className="h-6 w-6 rounded-full" /></div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
        <Bone className="h-14 w-14 rounded-full" />
        <Bone className="mt-2 h-6 w-60" />
        <Bone className="h-3.5 w-72 max-w-full" />
        <div className="mt-5 w-full max-w-sm space-y-2">{[0, 1, 2].map(i => <Bone key={i} className="h-[46px] w-full rounded-2xl" />)}</div>
      </div>
      <Bone className="h-[58px] w-full rounded-3xl" />
    </SkeletonPage>
  );
}
