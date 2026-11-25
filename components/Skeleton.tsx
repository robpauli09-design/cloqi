/**
 * Skeleton building blocks for the loading.tsx of each tab. They copy the real page's grid, card sizes and
 * headings, so nothing jumps when the content arrives.
 */

export function Bone({ className = '' }: { className?: string }) {
  // default rounding only when the caller sets none – otherwise rounded-lg would win over rounded-full in the CSS order
  return <div aria-hidden className={`skeleton ${/(^|\s)(\w+:)?rounded/.test(className) ? '' : 'rounded-lg'} ${className}`} />;
}

/** Outer wrapper: announces loading for screen readers, fades in so quick switches don't flash. */
export function SkeletonPage({ children, className = 'space-y-6' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`skeleton-page ${className}`} aria-busy="true">
      <span className="sr-only" role="status">Lädt …</span>
      {children}
    </div>
  );
}

/** A few text lines with ragged ends like real text. */
export function Lines({ n = 3, className = '' }: { n?: number; className?: string }) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-3/4', 'w-5/6'];
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: n }, (_, i) => <Bone key={i} className={`h-3.5 ${i === n - 1 && n > 1 ? 'w-1/2' : widths[i % widths.length]}`} />)}
    </div>
  );
}

/** Card with a title bar and content lines: the most common block. */
export function CardSkeleton({ title = 'w-40', lines = 3, children, className = '' }: { title?: string; lines?: number; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`card card-pad ${className}`}>
      <Bone className={`mb-5 h-5 ${title}`} />
      {children ?? <Lines n={lines} />}
    </section>
  );
}

/** Form fields in a 2-column grid (Learn, Life, Profile). */
export function FieldsSkeleton({ rows = 2, cols = 2 }: { rows?: number; cols?: number }) {
  return (
    <div className={`grid gap-4 ${cols === 2 ? 'sm:grid-cols-2' : ''}`}>
      {Array.from({ length: rows * cols }, (_, i) => (
        <div key={i} className="space-y-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-[42px] w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Page heading: eyebrow, title, subtitle, mascot on the right (Learn, Wissen, Kalender verbinden). */
export function HeaderSkeleton({ title = 'w-56', mascot = true }: { title?: string; mascot?: boolean }) {
  return (
    <header className="flex items-end gap-4">
      <div className="flex-1 space-y-2.5">
        <Bone className="h-3 w-20" />
        <Bone className={`h-8 ${title}`} />
        <Bone className="h-3.5 w-full max-w-xl" />
        <Bone className="h-3.5 w-2/3 max-w-sm" />
      </div>
      {mascot && <Bone className="hidden h-[92px] w-[92px] shrink-0 rounded-full sm:block" />}
    </header>
  );
}

/** Colored hero card (Life, Sport, Cycle): same gradient as the real one, bones inside. */
export function HeroSkeleton({ tint, chip = false }: { tint: string; chip?: boolean }) {
  return (
    <header className={`card relative overflow-hidden bg-gradient-to-br from-white ${tint} p-6 sm:p-8`}>
      <div className="flex items-center gap-6">
        <div className="flex-1 space-y-3">
          <Bone className="h-3 w-16" />
          <Bone className="h-8 w-full max-w-md" />
          <Bone className="h-3.5 w-full max-w-xl" />
          <Bone className="h-3.5 w-3/5 max-w-sm" />
          {chip && <Bone className="!mt-4 h-7 w-44 rounded-full" />}
        </div>
        <Bone className="hidden h-32 w-32 shrink-0 rounded-full sm:block" />
      </div>
    </header>
  );
}

/** List rows with icon square, two lines and something on the right. */
export function RowsSkeleton({ n = 3, icon = true }: { n?: number; icon?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-4 py-3.5">
          {icon && <Bone className="h-11 w-11 shrink-0 rounded-2xl" />}
          <div className="flex-1 space-y-2">
            <Bone className={`h-4 ${['w-32', 'w-40', 'w-28'][i % 3]}`} />
            <Bone className={`h-3 ${['w-3/4', 'w-2/3', 'w-1/2'][i % 3]}`} />
          </div>
          <Bone className="h-8 w-20 shrink-0 rounded-xl" />
        </li>
      ))}
    </ul>
  );
}
