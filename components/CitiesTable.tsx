'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ViewSwitcher from './ViewSwitcher';
import { useCityFilters, SortKey } from './CityFiltersContext';
import { useFilteredCities } from '@/lib/useFilteredCities';
import type { City } from '@/lib/cityShape';

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
        className: 'min-w-[70px] font-mono text-[12px]',
        render: c => c.koppen ?? '—',
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
        className: 'min-w-[140px]',
        render: c => <span className="truncate block">{c.language ?? '—'}</span>,
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

  return (
    <section className="w-full bg-white">
      {/* Discreet page label. Lives in a thin top chrome bar instead of a
          hero — keeps the H1 in the document for SEO and gives the user a
          quiet anchor for "where am I" without claiming hero real estate.
          Same uppercase tracked treatment as the sidebar section labels so
          it reads as chrome, not content. */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-sand">
        <h1 className="text-[11px] uppercase tracking-[0.18em] font-medium text-ink-deep">
          City Data
        </h1>
      </div>

      {/* Edge-to-edge table — fills the entire main content area. Sticky
          header on vertical scroll, horizontal scroll on narrow viewports. */}
      <div className="overflow-x-auto">
        <table className="w-full text-small text-ink border-collapse">
          <thead className="sticky top-0 z-10 bg-cream-soft">
            <tr>
              {columns.map(col => {
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
                {columns.map(col => (
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

      <ViewSwitcher />
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
