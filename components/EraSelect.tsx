'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// === EraSelect =============================================================
// Searchable single-select dropdown of named historical periods. Replaces
// the era quick-pick chip row that lived under YearRangeSlider — chips
// only fit ~5 eras before wrapping; a dropdown comfortably holds 40+.
//
// Each era maps to a [min, max] year range that gets applied to the
// inception filter when selected. Negative years = BCE. The list is
// curated for traveler-relevant periods (cultural eras with recognisable
// landmark architecture) — Bronze Age through Contemporary, plus
// regional periods (Edo Japan, Tang China, Mughal India, etc.) for
// depth without going to academia-level granularity.

export type Era = {
  name: string;
  min: number | null;
  max: number | null;
  /** Optional grouping for visual section breaks in the dropdown. */
  group?: string;
};

export const ERAS: Era[] = [
  // === Pre-classical ===
  { name: 'Any era', min: null, max: null },
  { name: 'Bronze Age',          group: 'Pre-classical', min: -3300, max: -1200 },
  { name: 'Iron Age',            group: 'Pre-classical', min: -1200, max: 500 },
  { name: 'Old Kingdom Egypt',   group: 'Pre-classical', min: -2700, max: -2200 },
  { name: 'New Kingdom Egypt',   group: 'Pre-classical', min: -1550, max: -1077 },

  // === Classical antiquity ===
  { name: 'Classical Antiquity', group: 'Antiquity', min: -800, max: 500 },
  { name: 'Archaic Greek',       group: 'Antiquity', min: -800, max: -510 },
  { name: 'Classical Greek',     group: 'Antiquity', min: -510, max: -323 },
  { name: 'Hellenistic',         group: 'Antiquity', min: -323, max: -31 },
  { name: 'Roman Republic',      group: 'Antiquity', min: -509, max: -27 },
  { name: 'Roman Empire',        group: 'Antiquity', min: -27,  max: 476 },
  { name: 'Late Antiquity',      group: 'Antiquity', min: 200,  max: 700 },

  // === Medieval ===
  { name: 'Early Middle Ages',   group: 'Medieval', min: 500,  max: 1000 },
  { name: 'High Middle Ages',    group: 'Medieval', min: 1000, max: 1300 },
  { name: 'Late Middle Ages',    group: 'Medieval', min: 1300, max: 1500 },
  { name: 'Byzantine',           group: 'Medieval', min: 330,  max: 1453 },
  { name: 'Anglo-Saxon',         group: 'Medieval', min: 450,  max: 1066 },
  { name: 'Viking Age',          group: 'Medieval', min: 793,  max: 1066 },
  { name: 'Carolingian',         group: 'Medieval', min: 750,  max: 1000 },
  { name: 'Crusader Era',        group: 'Medieval', min: 1095, max: 1291 },
  { name: 'Tang Dynasty',        group: 'Medieval', min: 618,  max: 907 },
  { name: 'Song Dynasty',        group: 'Medieval', min: 960,  max: 1279 },

  // === Early modern ===
  { name: 'Renaissance',         group: 'Early modern', min: 1300, max: 1600 },
  { name: 'Italian Renaissance', group: 'Early modern', min: 1330, max: 1550 },
  { name: 'Age of Exploration',  group: 'Early modern', min: 1418, max: 1620 },
  { name: 'Tudor',               group: 'Early modern', min: 1485, max: 1603 },
  { name: 'Reformation',         group: 'Early modern', min: 1517, max: 1648 },
  { name: 'Elizabethan',         group: 'Early modern', min: 1558, max: 1603 },
  { name: 'Mughal',              group: 'Early modern', min: 1526, max: 1857 },
  { name: 'Edo Japan',           group: 'Early modern', min: 1603, max: 1868 },
  { name: 'Ming Dynasty',        group: 'Early modern', min: 1368, max: 1644 },
  { name: 'Qing Dynasty',        group: 'Early modern', min: 1644, max: 1912 },
  { name: 'Baroque',             group: 'Early modern', min: 1600, max: 1750 },
  { name: 'Ottoman Classical',   group: 'Early modern', min: 1453, max: 1683 },
  { name: 'Enlightenment',       group: 'Early modern', min: 1685, max: 1815 },
  { name: 'Georgian',            group: 'Early modern', min: 1714, max: 1830 },

  // === 19th century ===
  { name: 'Industrial Revolution', group: '19th century', min: 1760, max: 1840 },
  { name: 'Regency',             group: '19th century', min: 1811, max: 1820 },
  { name: 'Romantic',             group: '19th century', min: 1800, max: 1850 },
  { name: 'Victorian',            group: '19th century', min: 1837, max: 1901 },
  { name: 'Belle Époque',         group: '19th century', min: 1871, max: 1914 },

  // === 20th century → ===
  { name: 'Edwardian',            group: '20th century', min: 1901, max: 1914 },
  { name: 'World War I era',      group: '20th century', min: 1914, max: 1918 },
  { name: 'Interwar',             group: '20th century', min: 1918, max: 1939 },
  { name: 'Art Deco',             group: '20th century', min: 1920, max: 1939 },
  { name: 'World War II era',     group: '20th century', min: 1939, max: 1945 },
  { name: 'Postwar',              group: '20th century', min: 1945, max: 1989 },
  { name: 'Cold War',             group: '20th century', min: 1947, max: 1991 },
  { name: 'Contemporary',         group: '20th century', min: 1991, max: null },

  // === Coarse buckets — kept at the bottom because they overlap several
  //     of the more specific periods above. Useful as a quick glance. ===
  { name: 'Antiquity (broad)',    group: 'Coarse',       min: -3000, max: 500 },
  { name: 'Medieval (broad)',     group: 'Coarse',       min: 500,   max: 1500 },
  { name: 'Early modern (broad)', group: 'Coarse',       min: 1500,  max: 1800 },
  { name: 'Modern (broad)',       group: 'Coarse',       min: 1800,  max: null },
];

type Props = {
  /** Currently-applied year range, used to derive which era (if any) is
   *  selected. Custom ranges that don't match any era show as "Custom". */
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
};

function eraMatchesRange(e: Era, min: number | null, max: number | null): boolean {
  return e.min === min && e.max === max;
}

function fmtBoundary(n: number | null, side: 'min' | 'max'): string {
  if (n == null) return side === 'min' ? '…' : 'now';
  if (n < 0) return `${-n} BCE`;
  return String(n);
}

export default function EraSelect({ min, max, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape — mirrors SearchableMultiSelect.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Which era is currently active? Fall through to "Custom range" if none
  // of the named eras exactly match.
  const currentEra = useMemo(
    () => ERAS.find(e => eraMatchesRange(e, min, max)) ?? null,
    [min, max]
  );

  // Search-filter the era list. Matches across name + group so typing
  // "med" finds both the Medieval bucket and the Mughal Era.
  const filtered = useMemo(() => {
    if (!q.trim()) return ERAS;
    const needle = q.trim().toLowerCase();
    return ERAS.filter(
      e =>
        e.name.toLowerCase().includes(needle) ||
        (e.group ?? '').toLowerCase().includes(needle)
    );
  }, [q]);

  // Group items in render so the dropdown shows section headers ("Medieval",
  // "Early modern", etc.). Within each group, original order is preserved.
  const grouped = useMemo(() => {
    const groups = new Map<string, Era[]>();
    for (const e of filtered) {
      const k = e.group ?? '';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const handlePick = (e: Era) => {
    onChange({ min: e.min, max: e.max });
    setOpen(false);
    setQ('');
  };

  const triggerLabel = currentEra
    ? currentEra.name
    : (min == null && max == null)
      ? 'Any era'
      : `Custom: ${fmtBoundary(min, 'min')} → ${fmtBoundary(max, 'max')}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={
          'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-small ' +
          'rounded-md border border-sand bg-white text-ink-deep ' +
          'hover:border-slate transition-colors ' +
          'focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10'
        }
        aria-expanded={open}
      >
        <span className="truncate">
          <span className="text-muted text-micro uppercase tracking-[0.14em] mr-1">Era:</span>
          {triggerLabel}
        </span>
        <span aria-hidden className="text-muted text-micro">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-sand rounded-md shadow-card overflow-hidden">
          <div className="p-2 border-b border-sand">
            <input
              type="search"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search eras (e.g. 'Victorian')"
              className="w-full px-2 py-1 text-small rounded border border-sand bg-white text-ink focus:outline-none focus:border-ink-deep"
            />
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {grouped.length === 0 && (
              <li className="px-2.5 py-2 text-label text-muted">No eras match.</li>
            )}
            {grouped.map(([groupName, items]) => (
              <li key={groupName || '_root'}>
                {groupName && (
                  <div className="px-2.5 pt-2 pb-1 text-micro uppercase tracking-[0.14em] text-muted font-medium">
                    {groupName}
                  </div>
                )}
                <ul>
                  {items.map(e => {
                    const active = currentEra?.name === e.name;
                    return (
                      <li key={e.name}>
                        <button
                          type="button"
                          onClick={() => handlePick(e)}
                          className={
                            'w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-label text-left transition-colors ' +
                            (active
                              ? 'bg-cream-soft text-ink-deep font-medium'
                              : 'text-ink-deep hover:bg-cream-soft')
                          }
                        >
                          <span className="truncate">{e.name}</span>
                          <span className="text-muted text-micro tabular-nums font-mono flex-shrink-0">
                            {fmtBoundary(e.min, 'min')}–{fmtBoundary(e.max, 'max')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
