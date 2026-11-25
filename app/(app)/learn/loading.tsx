import { Bone, CardSkeleton, FieldsSkeleton, HeaderSkeleton, Lines, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <HeaderSkeleton title="w-52" />
      {/* assistant input */}
      <div className="card flex items-center gap-3 p-5"><Bone className="h-11 w-11 shrink-0 rounded-full" /><Bone className="h-11 flex-1 rounded-full" /><Bone className="h-11 w-11 shrink-0 rounded-full" /></div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between"><Bone className="h-5 w-56" /><Bone className="h-8 w-32 rounded-xl" /></div>
          {[0, 1].map(i => (
            <div key={i} className="card flex items-center gap-4 p-5">
              <Bone className="h-12 w-12 shrink-0 rounded-2xl" />
              <div className="flex-1 space-y-2"><Bone className="h-4 w-40" /><Bone className="h-3 w-2/3" /></div>
            </div>
          ))}
          <CardSkeleton title="w-32"><FieldsSkeleton rows={2} /></CardSkeleton>
        </div>
        <aside className="space-y-4"><CardSkeleton title="w-36"><Lines n={5} /></CardSkeleton></aside>
      </div>
    </SkeletonPage>
  );
}
