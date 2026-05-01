'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Row = {
  id: string;
  name: string;
  slug: string | null;
  city: string;
  country: string;
  visited: boolean;
  kind: string | null;
};

type Filter = 'all' | 'visited' | 'not-visited';
type SortKey = 'recent' | 'name' | 'city' | 'country';
const KINDS = ['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit'] as const;
type Kind = typeof KINDS[number];

export default function VisitedEditorClient({ initialRows }: { initialRows: Row[] }) {
  // We splice rows out of the bulk roster as they're deleted server-side,
  // so the visible table tracks the live database. The original-visited
  // map is keyed by id, so dropping a row keeps the diff math sound.
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [originalVisited] = useState<Map<string, boolean>>(
    () => new Map(initialRows.map(r => [r.id, r.visited])),
  );
  const [current, setCurrent] = useState<Map<string, boolean>>(
    () => new Map(initialRows.map(r => [r.id, r.visited])),
  );

  async function deletePin(id: string, name: string) {
    if (!window.confirm(
      `Permanently delete "${name}" from the database? ` +
      `Personal photos go too. This can't be undone.`,
    )) return;
    setDeletingIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      const res = await fetch('/api/admin/delete-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'delete failed');
      setRows(prev => prev.filter(r => r.id !== id));
      setCurrent(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [country, setCountry] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<Set<Kind>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ updated: number; errors?: string[] } | null>(null);

  const dirty = useMemo(() => {
    const out: string[] = [];
    for (const [id, v] of current) {
      if (originalVisited.get(id) !== v) out.push(id);
    }
    return out;
  }, [current, originalVisited]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of initialRows) if (r.country) set.add(r.country);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [initialRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(r => {
      const visitedNow = current.get(r.id) ?? r.visited;
      if (filter === 'visited' && !visitedNow) return false;
      if (filter === 'not-visited' && visitedNow) return false;
      if (country && r.country !== country) return false;
      if (kindFilter.size > 0) {
        if (!r.kind || !kindFilter.has(r.kind as Kind)) return false;
      }
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.city.toLowerCase().includes(needle) ||
        r.country.toLowerCase().includes(needle)
      );
    });

    // Rows arrive pre-sorted by updated_at desc (server sets this).
    // Re-sort only when the user picks a non-recent key.
    if (sortKey !== 'recent') {
      out.sort((a, b) => {
        const A = sortKey === 'name' ? a.name : sortKey === 'city' ? a.city : a.country;
        const B = sortKey === 'name' ? b.name : sortKey === 'city' ? b.city : b.country;
        return A.localeCompare(B);
      });
    }
    return out;
  }, [rows, q, filter, country, kindFilter, sortKey, current]);

  const toggleKind = (k: Kind) => {
    setKindFilter(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setCurrent(prev => {
      const next = new Map(prev);
      next.set(id, !(next.get(id) ?? false));
      return next;
    });
  };

  const setVisitedAllVisible = (value: boolean) => {
    setCurrent(prev => {
      const next = new Map(prev);
      for (const r of filtered) next.set(r.id, value);
      return next;
    });
  };

  const reset = () => {
    setCurrent(new Map(originalVisited));
    setResult(null);
  };

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    setResult(null);
    try {
      const changes = dirty.map(id => ({ id, visited: current.get(id) ?? false }));
      const res = await fetch('/api/admin/update-visited', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors?.[0] ?? data?.error ?? `save failed (${res.status})`);
      setResult({ updated: data.updated ?? 0 });
      // After a successful save, treat current as the new baseline so the
      // dirty count drops to zero and Save disables again.
      for (const id of dirty) originalVisited.set(id, current.get(id) ?? false);
    } catch (e) {
      setResult({ updated: 0, errors: [e instanceof Error ? e.message : 'unknown'] });
    } finally {
      setSaving(false);
    }
  };

  const visitedCount = useMemo(
    () => [...current.values()].filter(Boolean).length,
    [current],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, city, country"
            className="text-small border border-sand rounded px-3 py-2 bg-white w-64"
          />
          <div className="inline-flex rounded border border-sand overflow-hidden text-label">
            {(['all', 'visited', 'not-visited'] as Filter[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={
                  'px-3 py-2 ' +
                  (filter === f
                    ? 'bg-ink-deep text-white'
                    : 'bg-white text-ink hover:bg-cream-soft')
                }
              >
                {f === 'all' ? 'All' : f === 'visited' ? 'Visited' : 'Not yet'}
              </button>
            ))}
          </div>
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            className="text-small border border-sand rounded px-2 py-2 bg-white max-w-[200px]"
            title="Filter by country"
          >
            <option value="">All countries</option>
            {countryOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="text-small border border-sand rounded px-2 py-2 bg-white"
            title="Sort"
          >
            <option value="recent">Recently edited</option>
            <option value="name">Name (A→Z)</option>
            <option value="city">City (A→Z)</option>
            <option value="country">Country (A→Z)</option>
          </select>

          <span className="text-label text-muted">
            {filtered.length} shown · {visitedCount} of {rows.length} visited
          </span>
        </div>

        {/* Kind chips */}
        <div className="w-full flex flex-wrap items-center gap-1.5">
          <span className="text-label uppercase tracking-wider text-muted mr-1">Kind</span>
          {KINDS.map(k => {
            const checked = kindFilter.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={
                  'pill text-label capitalize ' +
                  (checked
                    ? 'bg-ink-deep text-white border border-ink-deep'
                    : 'bg-cream-soft text-slate border border-sand hover:bg-sand/40')
                }
                aria-pressed={checked}
              >
                {k}
              </button>
            );
          })}
          {kindFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setKindFilter(new Set())}
              className="text-label text-muted hover:text-ink ml-1"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {filtered.length > 0 && filtered.length < rows.length && (
            <>
              <button
                type="button"
                onClick={() => setVisitedAllVisible(true)}
                className="text-label px-2 py-1 rounded border border-sand hover:bg-cream-soft text-ink"
                title="Mark all currently filtered rows as visited"
              >
                Tick filtered
              </button>
              <button
                type="button"
                onClick={() => setVisitedAllVisible(false)}
                className="text-label px-2 py-1 rounded border border-sand hover:bg-cream-soft text-ink"
                title="Unmark all currently filtered rows"
              >
                Untick filtered
              </button>
            </>
          )}
          <button
            type="button"
            onClick={reset}
            disabled={!dirty.length || saving}
            className="text-small px-3 py-2 rounded border border-sand text-ink disabled:text-muted/60 disabled:cursor-not-allowed hover:bg-cream-soft"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty.length || saving}
            className={
              'text-small px-4 py-2 rounded font-medium ' +
              (!dirty.length || saving
                ? 'bg-cream-soft text-muted cursor-not-allowed'
                : 'bg-teal text-white hover:bg-teal/90')
            }
          >
            {saving ? 'Saving…' : `Save changes${dirty.length ? ` (${dirty.length})` : ''}`}
          </button>
        </div>
      </div>

      {result && (
        <div
          className={
            'px-3 py-2 rounded text-small ' +
            (result.errors?.length ? 'bg-orange/10 text-orange' : 'bg-teal/10 text-teal')
          }
        >
          {result.errors?.length
            ? `Save failed: ${result.errors[0]}`
            : `Updated ${result.updated} pin${result.updated === 1 ? '' : 's'}.`}
        </div>
      )}

      {/* Table */}
      <div className="border border-sand rounded overflow-hidden">
        <table className="w-full text-small">
          <thead className="bg-cream-soft text-label uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left px-3 py-2 w-10"></th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell w-[110px]">Kind</th>
              <th className="text-left px-3 py-2 hidden sm:table-cell">City</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Country</th>
              <th className="text-left px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted text-small">
                  No pins match.
                </td>
              </tr>
            )}
            {filtered.map(row => {
              const visitedNow = current.get(row.id) ?? false;
              const isDirty = originalVisited.get(row.id) !== visitedNow;
              return (
                <tr
                  key={row.id}
                  className={
                    'border-t border-sand transition-colors ' +
                    (isDirty ? 'bg-teal/5' : 'hover:bg-cream-soft/40')
                  }
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={visitedNow}
                      onChange={() => toggleRow(row.id)}
                      className="cursor-pointer"
                      aria-label={`Mark ${row.name} as visited`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-ink-deep">
                    <button
                      type="button"
                      onClick={() => toggleRow(row.id)}
                      className="text-left hover:text-teal"
                    >
                      {row.name}
                    </button>
                    <Link
                      href={`/admin/pins/${row.id}`}
                      className="ml-2 text-micro text-teal hover:underline"
                    >
                      edit
                    </Link>
                    {row.slug && (
                      <Link
                        href={`/pins/${row.slug}`}
                        target="_blank"
                        className="ml-2 text-micro text-muted hover:text-teal"
                      >
                        view ↗
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => deletePin(row.id, row.name)}
                      disabled={deletingIds.has(row.id)}
                      className="ml-2 text-micro text-orange hover:underline disabled:opacity-50"
                      title="Permanently delete this pin"
                    >
                      {deletingIds.has(row.id) ? 'deleting…' : 'delete'}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top text-slate hidden lg:table-cell">
                    {row.kind ? (
                      <span className="capitalize text-label pill bg-cream-soft text-slate">
                        {row.kind}
                      </span>
                    ) : (
                      <span className="text-muted/60 text-label">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-slate hidden sm:table-cell">
                    {row.city || <span className="text-muted/60">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top text-slate hidden md:table-cell">
                    {row.country || <span className="text-muted/60">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top text-micro text-muted">
                    {isDirty ? '●' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
