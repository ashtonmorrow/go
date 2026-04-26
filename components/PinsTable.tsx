'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePinFilters } from './PinFiltersContext';
import { filterPins } from '@/lib/pinFilter';
import { flagCircle } from '@/lib/flags';
import type { Pin } from '@/lib/pins';

// === PinsTable =============================================================
// Sortable pin data table. Columns picked to be high-information per row:
// name, category, location, UNESCO ID, visited, coordinates. Maps icon in
// the rightmost column links straight to Google Maps for one-click
// directions.

type SortKey = 'name' | 'category' | 'country' | 'unescoId' | 'visited';

export default function PinsTable({
  pins,
  countryNameToIso2,
}: {
  pins: Pin[];
  countryNameToIso2: Record<string, string>;
}) {
  const ctx = usePinFilters();
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);

  // Apply the shared filter cockpit's predicates first; then the table's
  // local column-sort takes over. (Local sort overrides the cockpit's
  // sort dimension because the column headers are the more direct affordance.)
  const filtered = useMemo(() => {
    const state = ctx?.state;
    return state ? filterPins(pins, state) : pins;
  }, [pins, ctx?.state]);

  // Push counts up to the cockpit so the "X / Y pins" badge stays in sync.
  useEffect(() => {
    ctx?.setCounts(filtered.length, pins.length);
  }, [ctx, filtered.length, pins.length]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let A: string | number | boolean | null = '';
      let B: string | number | boolean | null = '';
      switch (sort) {
        case 'name':     A = a.name; B = b.name; break;
        case 'category': A = a.category ?? ''; B = b.category ?? ''; break;
        case 'country':  A = a.statesNames[0] ?? ''; B = b.statesNames[0] ?? ''; break;
        case 'unescoId': A = a.unescoId ?? -1; B = b.unescoId ?? -1; break;
        case 'visited':  A = Number(a.visited); B = Number(b.visited); break;
      }
      let cmp = 0;
      if (typeof A === 'number' && typeof B === 'number') cmp = A - B;
      else cmp = String(A).localeCompare(String(B));
      return desc ? -cmp : cmp;
    });
    return copy;
  }, [filtered, sort, desc]);

  const onSort = (k: SortKey) => {
    if (sort === k) setDesc(d => !d);
    else { setSort(k); setDesc(false); }
  };

  return (
    <div className="overflow-x-auto px-5 pb-8">
      <table className="w-full text-small border-separate border-spacing-0">
        <thead className="text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <Th k="name"     sort={sort} desc={desc} onSort={onSort}>Name</Th>
            <Th k="category" sort={sort} desc={desc} onSort={onSort}>Category</Th>
            <Th k="country"  sort={sort} desc={desc} onSort={onSort}>Location</Th>
            <Th k="unescoId" sort={sort} desc={desc} onSort={onSort}>UNESCO</Th>
            <Th k="visited"  sort={sort} desc={desc} onSort={onSort}>Visited</Th>
            <th className="text-left py-2 pr-3 font-medium border-b border-sand">Maps</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const country = p.statesNames[0] ?? null;
            const flagUrl = country ? flagCircle(countryNameToIso2[country.toLowerCase()] ?? null) : null;
            const placeText = [p.cityNames[0], country].filter(Boolean).join(', ');
            return (
              <tr key={p.id} className="hover:bg-cream-soft">
                <td className="py-2 pr-3 border-b border-sand">
                  <Link
                    href={`/pins/${p.slug ?? p.id}`}
                    className="text-ink-deep font-medium hover:text-teal"
                  >
                    {p.name}
                  </Link>
                </td>
                <Td>{p.category}</Td>
                <td className="py-2 pr-3 border-b border-sand">
                  <span className="inline-flex items-center gap-1.5">
                    {flagUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flagUrl} alt="" className="w-4 h-4 rounded-full border border-sand" />
                    )}
                    <span className="text-slate">{placeText || <span className="text-muted">—</span>}</span>
                  </span>
                </td>
                <Td>
                  {p.unescoId != null
                    ? <a
                        href={p.unescoUrl ?? '#'}
                        target="_blank" rel="noopener noreferrer"
                        className="text-teal hover:underline tabular-nums"
                      >#{p.unescoId}</a>
                    : null}
                </Td>
                <td className="py-2 pr-3 border-b border-sand">
                  {p.visited
                    ? <span className="text-teal text-[11px] uppercase tracking-wider">Been</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="py-2 pr-3 border-b border-sand">
                  {p.googleMapsUrl
                    ? <a
                        href={p.googleMapsUrl}
                        target="_blank" rel="noopener noreferrer"
                        className="text-teal hover:underline text-[11px]"
                      >Open ↗</a>
                    : <span className="text-muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  k, sort, desc, onSort, children,
}: {
  k: SortKey; sort: SortKey; desc: boolean;
  onSort: (k: SortKey) => void; children: React.ReactNode;
}) {
  const active = sort === k;
  return (
    <th className="text-left py-2 pr-3 font-medium border-b border-sand">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={'inline-flex items-center gap-1 hover:text-ink-deep ' + (active ? 'text-ink-deep' : '')}
      >
        {children}
        {active && <span aria-hidden>{desc ? '↓' : '↑'}</span>}
      </button>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-2 pr-3 border-b border-sand text-slate">
      {children || <span className="text-muted">—</span>}
    </td>
  );
}
