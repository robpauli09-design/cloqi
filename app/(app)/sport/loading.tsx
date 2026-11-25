import { Bone, CardSkeleton, HeroSkeleton, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <HeroSkeleton tint="to-[#DDF3F1]/80" chip />
      <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="card card-pad">
            <div className="mb-5 flex items-center justify-between"><Bone className="h-5 w-40" /><Bone className="h-8 w-32 rounded-xl" /></div>
            <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <Bone key={i} className="h-[92px] rounded-2xl" />)}</div>
            <Bone className="mt-4 h-4 w-28" />
          </section>
          <CardSkeleton title="w-24" lines={2} />
        </div>
        <CardSkeleton title="w-32" lines={2} />
      </div>
    </SkeletonPage>
  );
}
