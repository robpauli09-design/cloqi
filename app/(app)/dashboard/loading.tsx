import { Bone, CardSkeleton, Lines, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      {/* greeting */}
      <section className="card relative overflow-hidden bg-gradient-to-br from-white via-white to-leaf-soft">
        <div className="flex flex-col-reverse gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1">
            <Bone className="h-3 w-48" />
            <Bone className="mt-3 h-9 w-full max-w-sm sm:h-10" />
            <Bone className="mt-3 h-4 w-44" />
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-leaf/20 bg-white/80 p-4">
              <Bone className="h-5 w-5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2"><Bone className="h-3 w-24" /><Bone className="h-3.5 w-3/4" /></div>
            </div>
          </div>
          <Bone className="mx-auto h-[150px] w-[150px] shrink-0 rounded-full sm:mx-0 sm:h-[190px] sm:w-[190px]" />
        </div>
      </section>
      {/* stat tiles */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card p-4">
            <Bone className="h-3 w-3/4" />
            <Bone className="mt-3 h-5 w-10" />
            <Bone className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <CardSkeleton title="w-28">
          <ul className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <li key={i} className="flex items-center gap-3">
                <Bone className="h-3 w-11 shrink-0" />
                <Bone className="h-12 flex-1 rounded-xl" />
              </li>
            ))}
          </ul>
        </CardSkeleton>
        <div className="space-y-6">
          <CardSkeleton title="w-36">
            <div className="flex items-center gap-5">
              <Bone className="h-[88px] w-[88px] shrink-0 rounded-full" />
              <Lines n={4} className="flex-1" />
            </div>
            <div className="mt-5 grid grid-cols-7 gap-2">{Array.from({ length: 7 }, (_, i) => <Bone key={i} className="h-14 rounded-lg" />)}</div>
          </CardSkeleton>
          <CardSkeleton title="w-36" lines={2} />
        </div>
      </div>
    </SkeletonPage>
  );
}
