// === Stat blocks ===========================================================
// Tiny presentational primitives used by the three Stats pages
// (/cities/stats, /countries/stats, /pins/stats). Same shadcn-shaped
// language as the rest of the site — `card` surface, muted labels in
// uppercase tracking, ink-deep numerics.
//
// Server components by default; no client interactivity.

export function BigStat({
  value,
  label,
  hint,
}: {
  value: string | number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium">
        {label}
      </div>
      <div className="mt-1 text-h2 text-ink-deep tabular-nums leading-tight">
        {typeof value === 'number' ? value.toLocaleString('en') : value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[11px] text-slate">{hint}</div>
      )}
    </div>
  );
}

/**
 * Simple breakdown rendered as a label + bar + count row, where bar
 * length is proportional to the row's count vs. the largest in the
 * list. Useful for "by continent", "by category", etc.
 */
export function Breakdown({
  title,
  rows,
  href,
  emptyText = 'No data.',
}: {
  title: string;
  rows: { label: string; count: number; href?: string }[];
  /** Optional sectional header link (e.g. "see all 213 →"). */
  href?: string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">
          {title}
        </h2>
        {href && (
          <a href={href} className="text-[11px] text-teal hover:underline">
            see all →
          </a>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-small text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-small">
          {rows.map(r => {
            const pct = (r.count / max) * 100;
            const label = r.href
              ? <a href={r.href} className="hover:text-teal">{r.label}</a>
              : r.label;
            return (
              <li key={r.label} className="flex items-center gap-2">
                <span className="flex-1 truncate text-ink-deep">{label}</span>
                <div className="w-20 h-1.5 bg-cream-soft rounded overflow-hidden">
                  <div
                    className="h-full bg-teal/60"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
                <span className="w-10 text-right tabular-nums text-muted text-[11px]">
                  {r.count.toLocaleString('en')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Plain key-value rows. Use when you want a fact list rather than a
 * proportional bar chart (e.g. "founded earliest", "highest elevation").
 */
export function FactList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; href?: string }[];
}) {
  return (
    <section className="card p-4">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">
        {title}
      </h2>
      <dl className="mt-3 space-y-1.5 text-small">
        {rows.map(r => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-slate truncate">
              {r.href ? <a href={r.href} className="hover:text-teal">{r.label}</a> : r.label}
            </dt>
            <dd className="text-ink-deep tabular-nums whitespace-nowrap">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
