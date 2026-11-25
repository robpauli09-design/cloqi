import { Bone, CardSkeleton, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <header className="card relative overflow-hidden bg-gradient-to-br from-white to-[#FBE5EF] p-6 sm:p-8">
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center">
          <div className="flex-1 space-y-3">
            <Bone className="h-3 w-14" />
            <Bone className="h-8 w-64 max-w-full" />
            <Bone className="h-3.5 w-full max-w-lg" />
            <Bone className="h-3 w-3/4 max-w-md" />
          </div>
          <Bone className="h-[130px] w-[130px] shrink-0 rounded-full" />
        </div>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_1.1fr]">
        <CardSkeleton title="w-40">
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <Bone key={i} className="h-[42px] rounded-xl" />)}</div>
          <Bone className="mt-5 h-10 w-36 rounded-xl" />
        </CardSkeleton>
        <CardSkeleton title="w-48">
          <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 28 }, (_, i) => <Bone key={i} className="aspect-square rounded-lg" />)}</div>
        </CardSkeleton>
      </div>
    </SkeletonPage>
  );
}
