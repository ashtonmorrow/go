'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// === CountriesTable ========================================================
// Compact sortable data table for the country atlas. First-pass simple:
// sortable columns, click any row to open the detail page, keyboard
// scrollable. Shares the City Data table's visual rhythm so the two views
// feel like siblings.
//
// Future-pass: hook into the city FilterPanel (continent multi-select,
// schengen toggle, etc.) once we generalise the cockpit. For now the
// table is unfiltered — 213 rows fits on screen for most users.

type Row = {
  id: string;
  name: string;
  slug: string;
  flag: string | null;
  iso2: string | null;
  iso3: string | null;
  continent: string | null;
  capital: string | null;
  language: string | null;
  currency: string | null;
  callingCode: string | null;
  schengen: boolean;
  voltage: string | null;
  plugTypes: string[];
  tapWater: string | null;
  visa: string | null;
  driveSide: 'L' | 'R' | null;
  cityCount: number;
  beenCount: number;
};

type SortKey =
  | 'name' | 'continent' | 'capital' | 'language' | 'currency'
  | 'callingCode' | 'voltage' | 'tapWater' | 'visa' | 'cityCount';

export default function CountriesTable({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const A = a[sort] ?? '';
      const B = b[sort] ?? '';
      let cmp = 0;
      if (typeof A === 'number' && typeof B === 'number') cmp = A - B;
      else cmp = String(A).localeCompare(String(B));
      return desc ? -cmp : cmp;
    });
    return copy;
  }, [rows, sort, desc]);

  const onSort = (k: SortKey) => {
    if (sort === k) setDesc(d => !d);
    else { setSort(k); setDesc(false); }
  };

  return (
    <div className="overflow-x-auto px-5 pb-8">
      <table className="w-full text-small border-separate border-spacing-0">
        <thead className="text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <Th k="name"        sort={sort} desc={desc} onSort={onSort}>Country</Th>
            <Th k="continent"   sort={sort} desc={desc} onSort={onSort}>Continent</Th>
            <Th k="capital"     sort={sort} desc={desc} onSort={onSort}>Capital</Th>
            <Th k="language"    sort={sort} desc={desc} onSort={onSort}>Language</Th>
            <Th k="currency"    sort={sort} desc={desc} onSort={onSort}>Currency</Th>
            <Th k="callingCode" sort={sort} desc={desc} onSort={onSort}>Code</Th>
            <Th k="voltage"     sort={sort} desc={desc} onSort={onSort}>Plugs</Th>
            <Th k="tapWater"    sort={sort} desc={desc} onSort={onSort}>Water</Th>
            <Th k="visa"        sort={sort} desc={desc} onSort={onSort}>US Visa</Th>
            <Th k="cityCount"   sort={sort} desc={desc} onSort={onSort}>Cities</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} className="hover:bg-cream-soft">
              <td className="py-2 pr-3 border-b border-sand">
                <Link
                  href={`/countries/${r.slug}`}
                  className="flex items-center gap-2 text-ink-deep hover:text-teal"
                >
                  {r.flag && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.flag} alt="" className="w-5 h-auto rounded-sm border border-sand" />
                  )}
                  <span className="font-medium">{r.name}</span>
                </Link>
              </td>
              <Td>{r.continent}</Td>
              <Td>{r.capital}</Td>
              <Td>{r.language}</Td>
              <Td>{r.currency}</Td>
              <Td>{r.callingCode}</Td>
              <Td>{[r.voltage, r.plugTypes.join('/')].filter(Boolean).join(' · ')}</Td>
              <Td>{r.tapWater}</Td>
              <Td>{r.visa}</Td>
              <td className="py-2 pr-3 border-b border-sand text-[12px] tabular-nums text-slate">
                {r.cityCount > 0
                  ? <>{r.cityCount}{r.beenCount > 0 ? <> · <span className="text-teal">{r.beenCount}</span></> : null}</>
                  : <span className="text-muted">—</span>}
              </td>
            </tr>
          ))}
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
