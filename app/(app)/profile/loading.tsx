import { Bone, CardSkeleton, FieldsSkeleton, Lines, RowsSkeleton, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <header className="flex items-center gap-4">
        <Bone className="h-[72px] w-[72px] shrink-0 rounded-full" />
        <div className="space-y-2.5"><Bone className="h-3 w-40" /><Bone className="h-8 w-36" /><Bone className="h-3.5 w-64 max-w-full" /></div>
      </header>
      <div className="gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
        <CardSkeleton title="w-20">
          <FieldsSkeleton rows={2} />
          <Bone className="mt-5 h-[72px] w-full rounded-2xl" />
          <Bone className="mt-5 h-10 w-28 rounded-xl" />
        </CardSkeleton>
        <CardSkeleton title="w-48"><RowsSkeleton n={4} icon={false} /></CardSkeleton>
        <CardSkeleton title="w-44">
          <FieldsSkeleton rows={3} />
          <Bone className="mt-5 h-10 w-28 rounded-xl" />
        </CardSkeleton>
        <CardSkeleton title="w-24"><Lines n={2} /></CardSkeleton>
      </div>
    </SkeletonPage>
  );
}
