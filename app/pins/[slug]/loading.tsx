// === Loading skeleton for /pins/[slug] =====================================
// Next.js shows this automatically while the server fetches data for a
// pin detail page. Without it, clicking a card shows the previous page
// frozen until the new one is ready (the Wikipedia REST call can take
// 1-2s on a cold ISR cache, which reads as "the link doesn't work").
//
// Layout mirrors the real page: breadcrumb, title, hero, then a
// two-column body. Sized blocks give the user enough motion that the
// page feels responsive even when the network is slow.

export default function Loading() {
  return (
    <article
      className="max-w-page mx-auto px-5 py-8 animate-pulse"
      aria-busy="true"
      aria-label="Loading pin"
    >
      {/* Breadcrumb row */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="h-3 bg-cream-soft rounded w-40" />
        <div className="h-7 bg-cream-soft rounded-full w-72" />
      </div>

      {/* Title block */}
      <header className="border-b border-sand pb-5">
        <div className="h-10 bg-cream-soft rounded w-3/4 max-w-md" />
        <div className="mt-3 h-3 bg-cream-soft rounded w-1/2 max-w-sm" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <div className="h-5 bg-cream-soft rounded-full w-20" />
          <div className="h-5 bg-cream-soft rounded-full w-28" />
          <div className="h-5 bg-cream-soft rounded-full w-16" />
        </div>
      </header>

      {/* Hero */}
      <div className="mt-6 h-[40vh] bg-cream-soft rounded" />

      {/* Body */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-10 mt-8">
        <div className="space-y-3">
          <div className="h-3 bg-cream-soft rounded w-full" />
          <div className="h-3 bg-cream-soft rounded w-11/12" />
          <div className="h-3 bg-cream-soft rounded w-10/12" />
          <div className="h-3 bg-cream-soft rounded w-full" />
          <div className="h-3 bg-cream-soft rounded w-9/12" />
        </div>
        <aside className="space-y-3">
          <div className="card p-4">
            <div className="h-3 bg-cream-soft rounded w-20 mb-3" />
            <div className="h-9 bg-cream-soft rounded w-full" />
          </div>
          <div className="card p-4">
            <div className="h-3 bg-cream-soft rounded w-12 mb-3" />
            <div className="space-y-2">
              <div className="h-3 bg-cream-soft rounded w-full" />
              <div className="h-3 bg-cream-soft rounded w-4/5" />
              <div className="h-3 bg-cream-soft rounded w-3/4" />
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}
