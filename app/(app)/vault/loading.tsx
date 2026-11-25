import { Bone, HeaderSkeleton, Lines, SkeletonPage } from '@/components/Skeleton';

export default function Loading() {
  return (
    <SkeletonPage>
      <HeaderSkeleton title="w-44" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="card h-fit space-y-2 p-3">
          <Bone className="h-[38px] w-full rounded-xl" />
          {['w-32', 'w-24', 'w-20', 'w-20', 'w-16', 'w-24'].map((w, i) => (
            <div key={i} className={`flex items-center gap-2.5 px-2 py-1.5 ${i > 3 ? 'pl-5' : ''}`}><Bone className="h-4 w-4 rounded" /><Bone className={`h-3.5 ${w}`} /></div>
          ))}
        </aside>
        <section className="card min-h-[420px] p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-line pb-4"><Bone className="h-5 w-24" /><Bone className="h-8 w-48 rounded-xl" /></div>
          <Bone className="mt-6 h-7 w-40" />
          <Lines n={2} className="mt-4 max-w-xs" />
          <Bone className="mt-6 h-6 w-28" />
          <Bone className="mt-5 h-6 w-48" />
          <Lines n={3} className="mt-4 max-w-lg" />
        </section>
      </div>
    </SkeletonPage>
  );
}
