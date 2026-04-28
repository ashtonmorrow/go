'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCityFilters, SortKey } from './CityFiltersContext';
import { useFilteredCities } from '@/lib/useFilteredCities';
import type { City } from '@/lib/cityShape';
import KoppenIcon from './KoppenIcon';

type Props = { cities: City[] };

// Column descriptor. `sort` is set when the column is sortable — clicking
// the header sets the FilterPanel's sort state (which the table then reads
// back via useFilteredCities). Non-sortable columns are display-only.
type Column = {
  key: string;
  label: string;
  sort?: SortKey;
  // CSS for header + cell. Width is allocated via min/max so the header row
  // doesn't reflow while the user scrolls horizontally.
  className?: string;
  align?: 'left' | 'right' | 'center';
  // Cell renderer. Receives the row + a handful of helpers.
  render: (c: City) => React.ReactNode;
};

// Format helpers reused across cells.
function fmtPopulation(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Intl.NumberFormat('en').format(n);
}

function fmtTemp(low: number | null, high: number | null): string {
  if (low == null && high == null) return '—';
  return `${low != null ? low.toFixed(0) : '?'}–${high != null ? high.toFixed(0) : '?'}°C`;
}

function fmtNum(n: number | null, suffix = ''): string {
  return n == null ? '—' : Math.round(n).toLocaleString('en') + suffix;
}

export default function CitiesTable({ cities }: Props) {
  const router = useRouter();
  const filters = useCityFilters();

  const filtered = useFilteredCities(cities);

  const sort = filters?.state.sort ?? 'name';
  const desc = filters?.state.desc ?? false;

  // Column definitions. Sortable columns reference one of the existing
  // SortKey values from the FilterPanel — clicking the header just sets
  // that key (and toggles direction if it's already active).
  const columns: Column[] = useMemo(
    () => [
      {
        key: 'status',
        label: '',
        align: 'center',
        className: 'w-10 sticky left-0 bg-white',
        render: c => <StatusDots been={c.been} go={c.go} saved={!!c.savedPlaces} />,
      },
      {
        key: 'name',
        label: 'City',
        sort: 'name',
        className: 'min-w-[180px] sticky left-10 bg-white font-medium text-ink-deep',
        render: c => c.name,
      },
      {
        key: 'country',
        label: 'Country',
        className: 'min-w-[160px]',
        render: c => (
          <div className="flex items-center gap-1.5">
            {c.countryFlag && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.countryFlag}
                alt=""
                className="w-3.5 h-auto rounded-sm border border-sand flex-shrink-0"
              />
            )}
            <span className="truncate">{c.country ?? '—'}</span>
          </div>
        ),
      },
      {
        key: 'continent',
        label: 'Continent',
        className: 'min-w-[110px]',
        render: c => c.continent ?? '—',
      },
      {
        key: 'population',
        label: 'Pop',
        sort: 'population',
        align: 'right',
        className: 'min-w-[70px] tabular-nums',
        render: c => fmtPopulation(c.population),
      },
      {
        key: 'temp',
        label: 'Temp',
        sort: 'avgHigh',
        align: 'right',
        className: 'min-w-[90px] tabular-nums font-mono text-[12px]',
        render: c => fmtTemp(c.avgLow, c.avgHigh),
      },
      {
        key: 'rainfall',
        label: 'Rain',
        sort: 'rainfall',
        align: 'right',
        className: 'min-w-[80px] tabular-nums font-mono text-[12px]',
        render: c => fmtNum(c.rainfall, 'mm'),
      },
      {
        key: 'elevation',
        label: 'Elev',
        sort: 'elevation',
        align: 'right',
        className: 'min-w-[70px] tabular-nums font-mono text-[12px]',
        render: c => fmtNum(c.elevation, 'm'),
      },
      {
        key: 'koppen',
        label: 'Climate',
        align: 'center',
        className: 'min-w-[70px]',
        // Group-level icon (Tropical / Arid / Temperate / Continental /
        // Polar) with the precise Köppen code in the title + aria-label.
        render: c =>
          c.koppen ? (
            <span className="inline-flex items-center justify-center text-ink-deep">
              <KoppenIcon code={c.koppen} size={16} className="text-ink-deep" />
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        key: 'founded',
        label: 'Founded',
        sort: 'founded',
        align: 'right',
        className: 'min-w-[80px] tabular-nums font-mono text-[12px]',
        render: c => c.founded ?? '—',
      },
      {
        key: 'currency',
        label: 'Currency',
        className: 'min-w-[100px]',
        render: c => c.currency ?? '—',
      },
      {
        key: 'language',
        label: 'Language',
        // Cap max width and allow soft wrapping. Some countries have many
        // co-official languages ("Spanish, Catalan, Galician, Basque,
        // Aranese") which under truncate+nowrap stretched the column to
        // 600px, pushing every column right of it offscreen.
        className: 'w-[160px] min-w-[120px] max-w-[200px] whitespace-normal break-words',
        render: c => <span className="text-ink leading-snug">{c.language ?? '—'}</span>,
      },
      {
        key: 'drive',
        label: 'Drive',
        align: 'center',
        className: 'min-w-[60px]',
        render: c => (c.driveSide === 'L' ? 'left' : c.driveSide === 'R' ? 'right' : '—'),
      },
      {
        key: 'visa',
        label: 'Visa',
        className: 'min-w-[100px]',
        render: c => c.visa ?? '—',
      },
      {
        key: 'water',
        label: 'Tap water',
        className: 'min-w-[100px]',
        render: c => c.tapWater ?? '—',
      },
    ],
    []
  );

  const onHeaderClick = (col: Column) => {
    if (!col.sort || !filters) return;
    if (filters.state.sort === col.sort) {
      filters.setState(s => ({ ...s, desc: !s.desc }));
    } else {
      filters.setState(s => ({ ...s, sort: col.sort!, desc: false }));
    }
  };

  // === Columns picker ===
  // status + name are always pinned visible (the table is unreadable
  // without them); everything else is user-toggleable. Default = all on.
  const ALWAYS_VISIBLE: ReadonlySet<string> = useMemo(
    () => new Set(['status', 'name']),
    []
  );
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(columns.map(c => c.key))
  );
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!colsOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!colsRef.current?.contains(e.target as Node)) setColsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [colsOpen]);

  const visibleColumns = useMemo(
    () => columns.filter(c => visibleCols.has(c.key)),
    [columns, visibleCols]
  );

  const setAll = () => setVisibleCols(new Set(columns.map(c => c.key)));
  const setNone = () => setVisibleCols(new Set(ALWAYS_VISIBLE));
  const toggleCol = (key: string) => {
    if (ALWAYS_VISIBLE.has(key)) return; // always-pinned, no-op
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="w-full bg-white">
      {/* Discreet page label + columns picker. Thin chrome bar across the
          top of the table, sticky so it stays visible while the user
          scrolls vertically through the rows. */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-sand sticky top-0 z-20 bg-white">
        <h1 className="text-[11px] uppercase tracking-[0.18em] font-medium text-ink-deep">
          City Data
        </h1>

        {/* === Columns picker === */}
        <div ref={colsRef} className="relative">
          <button
            type="button"
            onClick={() => setColsOpen(o => !o)}
            className={
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-small ' +
              'border border-sand bg-white text-ink-deep ' +
              'hover:border-slate transition-colors ' +
              (colsOpen ? 'border-ink-deep' : '')
            }
            aria-expanded={colsOpen}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            Columns
            <span className="text-muted text-[10px] tabular-nums">
              {visibleColumns.length}/{columns.length}
            </span>
          </button>

          {colsOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white border border-sand rounded-md shadow-card overflow-hidden">
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-sand">
                <button
                  type="button"
                  onClick={setAll}
                  className="text-[11px] px-2 py-1 rounded hover:bg-cream-soft text-ink-deep"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={setNone}
                  className="text-[11px] px-2 py-1 rounded hover:bg-cream-soft text-ink-deep"
                >
                  None
                </button>
              </div>
              <ul className="max-h-72 overflow-y-auto py-1">
                {columns.map(col => {
                  const checked = visibleCols.has(col.key);
                  const locked = ALWAYS_VISIBLE.has(col.key);
                  return (
                    <li key={col.key}>
                      <button
                        type="button"
                        onClick={() => toggleCol(col.key)}
                        disabled={locked}
                        className={
                          'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left transition-colors ' +
                          (locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-cream-soft')
                        }
                      >
                        <span
                          aria-hidden
                          className={
                            'inline-flex items-center justify-center w-3.5 h-3.5 rounded border ' +
                            (checked
                              ? 'bg-ink-deep border-ink-deep text-white'
                              : 'border-sand bg-white')
                          }
                        >
                          {checked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        <span className="text-ink-deep flex-1">
                          {col.label || col.key}
                        </span>
                        {locked && (
                          <span className="text-muted text-[9px]" title="Always visible">🔒</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Edge-to-edge table — fills the entire main content area. Sticky
          header on vertical scroll, horizontal scroll on narrow viewports. */}
      <div className="overflow-x-auto">
        <table className="w-full text-small text-ink border-collapse">
          <thead className="sticky top-9 z-10 bg-cream-soft">
            <tr>
              {visibleColumns.map(col => {
                const sortable = !!col.sort;
                const isActive = sortable && col.sort === sort;
                return (
                  <th
                    key={col.key}
                    onClick={sortable ? () => onHeaderClick(col) : undefined}
                    className={
                      'text-left text-[10px] uppercase tracking-[0.12em] font-medium text-muted ' +
                      'px-3 py-2 border-b border-sand select-none ' +
                      (sortable ? 'cursor-pointer hover:text-ink-deep ' : '') +
                      (isActive ? 'text-ink-deep ' : '') +
                      (col.align === 'right' ? 'text-right ' : col.align === 'center' ? 'text-center ' : '') +
                      (col.className ?? '')
                    }
                    aria-sort={
                      isActive ? (desc ? 'descending' : 'ascending') : sortable ? 'none' : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {isActive && (
                        <span aria-hidden className="text-ink-deep">
                          {desc ? '↓' : '↑'}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/cities/${c.slug}`)}
                className={
                  'cursor-pointer transition-colors ' +
                  (i % 2 === 0 ? 'bg-white ' : 'bg-cream-soft/30 ') +
                  'hover:bg-cream'
                }
              >
                {visibleColumns.map(col => (
                  <td
                    key={col.key}
                    className={
                      'px-3 py-2 border-b border-sand/60 align-middle ' +
                      (col.align === 'right' ? 'text-right ' : col.align === 'center' ? 'text-center ' : '') +
                      (col.className ?? '')
                    }
                  >
                    {col.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-muted">No cities match the current filters.</div>
        )}
      </div>

      {/* View switcher lives at the page level now. */}
    </section>
  );
}

// Tiny status dots — left-most column. Teal=Been, slate=Go (and not Been),
// red pin emoji=has saved places. Compact + readable at the dense row height.
function StatusDots({ been, go, saved }: { been: boolean; go: boolean; saved: boolean }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {been && (
        <span
          aria-label="Been"
          title="Been"
          className="inline-block w-2 h-2 rounded-full bg-teal"
        />
      )}
      {go && !been && (
        <span
          aria-label="Want to go"
          title="Want to go"
          className="inline-block w-2 h-2 rounded-full bg-slate"
        />
      )}
      {saved && (
        <span aria-label="Has saved places" title="Has saved places" className="text-[10px]">
          📍
        </span>
      )}
    </div>
  );
}
