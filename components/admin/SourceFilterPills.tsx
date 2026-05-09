'use client';

// === SourceFilterPills =====================================================
// Shared pill bar used by EntityCoverPickerModal and CoverPickerModal to
// scope the photo grid by source (personal / pin / codex / city / country).
// Pills with zero count auto-hide except 'all', which always renders so
// the user has a clear "widen the filter" affordance.
//
// Counts are passed in (the caller has the unfiltered pool); the pills
// component is a dumb renderer over that map.

export type SourceFilterValue = 'all' | 'personal' | 'pin' | 'codex' | 'city' | 'country';

const ALL_PILLS: { id: SourceFilterValue; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'Personal' },
  { id: 'pin', label: 'Pin' },
  { id: 'codex', label: 'Codex' },
  { id: 'city', label: 'City' },
  { id: 'country', label: 'Country' },
];

export type SourceFilterCounts = Record<SourceFilterValue, number>;

export default function SourceFilterPills({
  active,
  counts,
  onChange,
  className,
}: {
  active: SourceFilterValue;
  counts: SourceFilterCounts;
  onChange: (next: SourceFilterValue) => void;
  className?: string;
}) {
  const visible = ALL_PILLS.filter(p => p.id === 'all' || counts[p.id] > 0);
  if (visible.length <= 1) return null;
  return (
    <div className={'flex flex-wrap items-center gap-1.5 ' + (className ?? '')}>
      {visible.map(p => {
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={isActive}
            className={
              'pill text-micro ' +
              (isActive
                ? 'bg-ink-deep text-white border border-ink-deep'
                : 'bg-cream-soft text-slate border border-sand hover:bg-sand/40')
            }
          >
            {p.label}
            <span className="ml-1 tabular-nums opacity-80">({counts[p.id]})</span>
          </button>
        );
      })}
    </div>
  );
}
