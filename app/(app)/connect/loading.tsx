import { Bone, HeaderSkeleton, RowsSkeleton, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage className="mx-auto max-w-3xl space-y-7">
      <HeaderSkeleton title="w-72" />
      {[3, 3, 1].map((n, i) => (
        <section key={i}>
          <Bone className="mb-3 ml-1 h-3 w-28" />
          <div className="card px-4 !py-0 sm:px-5"><RowsSkeleton n={n} /></div>
        </section>
      ))}
    </SkeletonPage>
  );
}
