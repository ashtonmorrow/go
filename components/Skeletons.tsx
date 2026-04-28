// === Skeletons =============================================================
// Shared loading-state primitives. Each route's loading.tsx pulls one of
// these — Next.js shows it automatically while a server fetch is
// pending, so the user sees motion instead of a frozen previous page.
//
// Five flavours covering the matrix of view shapes:
//   • <DetailSkeleton/>  — /cities/[slug], /countries/[slug], /pins/[slug]
//   • <GridSkeleton/>    — *.cards index pages
//   • <TableSkeleton/>   — *.table index pages
//   • <StatsSkeleton/>   — *.stats index pages
//   • <MapSkeleton/>     — full-bleed *.map pages
//
// All use the cream-soft surface tokens so the skeleton looks like the
// final layout, not a generic spinner.

const Bar = ({ w, h = 'h-3' }: { w: string; h?: string }) => (
  <div className={`${h} ${w} bg-cream-soft rounded`} />
);

export function DetailSkeleton() {
  return (
    <article className="max-w-page mx-auto px-5 py-8 animate-pulse" aria-busy>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <Bar w="w-40" />
        <div className="h-7 w-72 bg-cream-soft rounded-full" />
      </div>
      <header className="border-b border-sand pb-5">
        <div className="h-10 w-3/4 max-w-md bg-cream-soft rounded" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <div className="h-5 w-20 bg-cream-soft rounded-full" />
          <div className="h-5 w-28 bg-cream-soft rounded-full" />
          <div className="h-5 w-16 bg-cream-soft rounded-full" />
        </div>
      </header>
      <div className="mt-6 h-[40vh] bg-cream-soft rounded" />
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-10 mt-8">
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Bar key={i} w={i % 2 ? 'w-11/12' : 'w-full'} />
          ))}
        </div>
        <aside className="space-y-3">
          <div className="card p-4 space-y-2">
            <Bar w="w-20" />
            <div className="h-9 bg-cream-soft rounded" />
          </div>
          <div className="card p-4 space-y-2">
            <Bar w="w-16" />
            <Bar w="w-full" />
            <Bar w="w-4/5" />
            <Bar w="w-3/4" />
          </div>
        </aside>
      </div>
    </article>
  );
}

export function GridSkeleton({ tiles = 12 }: { tiles?: number }) {
  return (
    <div className="max-w-page mx-auto px-5 py-6 animate-pulse" aria-busy>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="h-7 w-32 bg-cream-soft rounded" />
        <div className="h-7 w-72 bg-cream-soft rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="card p-3 space-y-2">
            <div className="aspect-[3/2] bg-cream-soft rounded" />
            <Bar w="w-3/4" />
            <Bar w="w-1/2" h="h-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 14 }: { rows?: number }) {
  return (
    <div className="px-5 py-6 animate-pulse" aria-busy>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="h-7 w-32 bg-cream-soft rounded" />
        <div className="h-7 w-72 bg-cream-soft rounded-full" />
      </div>
      <div className="space-y-2">
        {/* Header row */}
        <div className="flex items-center gap-3 pb-2 border-b border-sand">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-3 w-16 bg-cream-soft rounded" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-sand">
            <div className="w-5 h-3 bg-cream-soft rounded-sm" />
            <div className="h-3 flex-1 max-w-[200px] bg-cream-soft rounded" />
            <div className="h-3 w-20 bg-cream-soft rounded" />
            <div className="h-3 w-16 bg-cream-soft rounded" />
            <div className="h-3 w-14 bg-cream-soft rounded" />
            <div className="h-3 w-10 bg-cream-soft rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="max-w-page mx-auto px-5 py-6 animate-pulse" aria-busy>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="h-7 w-40 bg-cream-soft rounded" />
        <div className="h-7 w-72 bg-cream-soft rounded-full" />
      </div>
      {/* Headline KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <Bar w="w-20" h="h-2" />
            <div className="h-7 w-24 bg-cream-soft rounded" />
            <Bar w="w-16" h="h-2" />
          </div>
        ))}
      </div>
      {/* Breakdown panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <section key={i} className="card p-4 space-y-2">
            <Bar w="w-32" h="h-2" />
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="flex items-center gap-2">
                <div className="flex-1 h-3 bg-cream-soft rounded" />
                <div className="w-20 h-1.5 bg-cream-soft rounded" />
                <div className="w-10 h-3 bg-cream-soft rounded" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export function MapSkeleton() {
  // Full-bleed pulsing surface — same dimensions the map will fill.
  return (
    <div
      className="w-full bg-cream-soft animate-pulse h-[calc(100svh-56px)] md:h-screen"
      aria-busy
      aria-label="Loading map"
    />
  );
}
