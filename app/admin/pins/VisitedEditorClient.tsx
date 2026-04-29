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
};

type Filter = 'all' | 'visited' | 'not-visited';

export default function VisitedEditorClient({ initialRows }: { initialRows: Row[] }) {
  const [originalVisited] = useState<Map<string, boolean>>(
    () => new Map(initialRows.map(r => [r.id, r.visited])),
  );
  const [current, setCurrent] = useState<Map<string, boolean>>(
    () => new Map(initialRows.map(r => [r.id, r.visited])),
  );
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ updated: number; errors?: string[] } | null>(null);

  const dirty = useMemo(() => {
    const out: string[] = [];
    for (const [id, v] of current) {
      if (originalVisited.get(id) !== v) out.push(id);
    }
    return out;
  }, [current, originalVisited]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return initialRows.filter(r => {
      const visitedNow = current.get(r.id) ?? r.visited;
      if (filter === 'visited' && !visitedNow) return false;
      if (filter === 'not-visited' && visitedNow) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.city.toLowerCase().includes(needle) ||
        r.country.toLowerCase().includes(needle)
      );
    });
  }, [initialRows, q, filter, current]);

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
          <div className="inline-flex rounded border border-sand overflow-hidden text-[11px]">
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
          <span className="text-[11px] text-muted">
            {filtered.length} shown · {visitedCount} of {initialRows.length} visited
          </span>
        </div>

        <div className="flex items-center gap-2">
          {filtered.length > 0 && filtered.length < initialRows.length && (
            <>
              <button
                type="button"
                onClick={() => setVisitedAllVisible(true)}
                className="text-[11px] px-2 py-1 rounded border border-sand hover:bg-cream-soft text-ink"
                title="Mark all currently filtered rows as visited"
              >
                Tick filtered
              </button>
              <button
                type="button"
                onClick={() => setVisitedAllVisible(false)}
                className="text-[11px] px-2 py-1 rounded border border-sand hover:bg-cream-soft text-ink"
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
          <thead className="bg-cream-soft text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left px-3 py-2 w-10"></th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2 hidden sm:table-cell">City</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Country</th>
              <th className="text-left px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted text-small">
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
                    {row.slug && (
                      <Link
                        href={`/pins/${row.slug}`}
                        target="_blank"
                        className="ml-2 text-[10px] text-muted hover:text-teal"
                      >
                        view ↗
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-slate hidden sm:table-cell">
                    {row.city || <span className="text-muted/60">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top text-slate hidden md:table-cell">
                    {row.country || <span className="text-muted/60">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top text-[10px] text-muted">
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
