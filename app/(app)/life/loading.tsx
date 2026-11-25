import { Bone, CardSkeleton, FieldsSkeleton, HeroSkeleton, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <HeroSkeleton tint="to-[#FBE5EF]/70" />
      <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <CardSkeleton title="w-40">
            <div className="mb-5 flex flex-wrap gap-2">{['w-20', 'w-16', 'w-20', 'w-24'].map((w, i) => <Bone key={i} className={`h-8 ${w} rounded-full`} />)}</div>
            <FieldsSkeleton rows={1} />
            <div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, i) => <Bone key={i} className="h-10 w-11 rounded-xl" />)}</div>
            <Bone className="mt-5 h-10 w-40 rounded-xl" />
          </CardSkeleton>
          <CardSkeleton title="w-36" lines={2} />
        </div>
        <div className="space-y-6">
          <CardSkeleton title="w-44">
            <Bone className="mb-4 h-3.5 w-4/5" />
            <div className="space-y-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className="flex items-center gap-6"><Bone className="h-3.5 w-20" /><Bone className="h-5 w-24 rounded-full" /></div>)}</div>
          </CardSkeleton>
          <CardSkeleton title="w-40" lines={1} />
        </div>
      </div>
    </SkeletonPage>
  );
}
