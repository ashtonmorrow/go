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

  // === Places enrichment state =============================================
  // Tracks one /api/admin/enrich-places run at a time. The stream is
  // NDJSON; each line is an EnrichEvent that updates this object and
  // the strip below the toolbar re-renders. Pricing tiers + cost cap
  // mirror what the API route calculates so the user sees the same
  // numbers that drive the spend.
  type EnrichState = {
    running: boolean;
    total: number;
    processed: number;
    enriched: number;
    skipped: number;
    cost: number;
    note: string | null;
    error: string | null;
    abortedAtCap: boolean;
  };
  const [enrich, setEnrich] = useState<EnrichState>({
    running: false,
    total: 0,
    processed: 0,
    enriched: 0,
    skipped: 0,
    cost: 0,
    note: null,
    error: null,
    abortedAtCap: false,
  });
  // Refresh toggle: default false (skip pins that already have price_level
  // set, the standard "is this enriched?" signal). Flip on for
  // backfill runs — e.g. when an earlier bulk run pulled price+hours but
  // not phone, refresh=true re-pulls everything and writes the new fields.
  // Curated values (priceTier, per-day weekly hours) still win on merge.
  const [enrichRefresh, setEnrichRefresh] = useState(false);

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

  // === Places enrichment trigger ==========================================
  // Confirms with the user (cost preview), POSTs the visible pin IDs to
  // /api/admin/enrich-places, then reads the NDJSON stream line-by-line
  // and updates the strip below the toolbar as events come in. Fields
  // default to price + hours so the typical user click does the most
  // useful enrichment without prompting for a field set every time.
  const enrichVisible = async () => {
    if (filtered.length === 0 || enrich.running) return;
    const pinIds = filtered.map(r => r.id);
    // Cost preview using the same model the API + script use:
    //   Find Place from Text:  $0.017 / pin (only when URL has no place_id)
    //   Place Details (price + hours):  $0.020 / pin (Enterprise tier)
    const worst = pinIds.length * (0.017 + 0.020);
    const best = pinIds.length * 0.020;
    const ok = window.confirm(
      `Enrich ${pinIds.length} filtered pin${pinIds.length === 1 ? '' : 's'} with Google Places?\n\n` +
      `Fields: price level, opening hours, and phone.\n` +
      `Cost estimate: $${best.toFixed(2)} (best case) — $${worst.toFixed(2)} (worst case).\n\n` +
      (enrichRefresh
        ? `Refresh mode is ON — every filtered pin gets re-fetched, even if it was enriched before. Use this for backfilling new fields like phone.\n\n`
        : `Pins that already have price_level set will be skipped automatically.\n\n`) +
      `Click Cancel to abort.`,
    );
    if (!ok) return;

    setEnrich({
      running: true,
      total: pinIds.length,
      processed: 0,
      enriched: 0,
      skipped: 0,
      cost: 0,
      note: 'starting…',
      error: null,
      abortedAtCap: false,
    });

    try {
      const res = await fetch('/api/admin/enrich-places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pinIds,
          // price + hours + phone + kind. price/phone share Google's
          // Pro tier ($0.005); hours bumps to Enterprise ($0.020); kind
          // (types + primaryType) rides in the free Essentials tier, so
          // adding it costs nothing extra and lets the enrichment
          // auto-classify pins where kind is null — unlocking the
          // restaurant / hotel / park / etc. rendering on detail pages.
          fields: ['price', 'hours', 'phone', 'kind'],
          // refresh=true re-pulls every filtered pin even if it was
          // already enriched. Used to backfill newly-added fields
          // (e.g. phone) on prior runs. Toggled via the checkbox next
          // to the Enrich button.
          refresh: enrichRefresh,
          // Soft ceiling at worst-case + 25% so a long run can't run
          // away. The user can override by re-running.
          maxCostUsd: Math.max(worst * 1.25, 1),
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `enrichment failed (${res.status})`);
      }

      // Read the NDJSON stream a chunk at a time. Each line is one
      // EnrichEvent — we update React state per event so the strip
      // re-renders smoothly as the run progresses.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'start') {
            setEnrich(prev => ({
              ...prev,
              total: (event.total as number) ?? prev.total,
              note: `processing ${event.total ?? '?'} pin${(event.total as number) === 1 ? '' : 's'}…`,
            }));
          } else if (event.type === 'progress') {
            const action = event.action as string;
            setEnrich(prev => ({
              ...prev,
              processed: prev.processed + 1,
              enriched: action === 'enriched' ? prev.enriched + 1 : prev.enriched,
              skipped: (action === 'no-match' || action === 'no-data') ? prev.skipped + 1 : prev.skipped,
              cost: typeof event.runningCost === 'number' ? event.runningCost : prev.cost,
              note: typeof event.pinName === 'string' ? `${action}: ${event.pinName}` : action,
              abortedAtCap: action === 'cost-cap' ? true : prev.abortedAtCap,
            }));
          } else if (event.type === 'done') {
            setEnrich(prev => ({
              ...prev,
              running: false,
              cost: (event.totalCost as number) ?? prev.cost,
              note: `done — ${event.written ?? 0} pins updated`,
              abortedAtCap: !!event.abortedAtCap,
            }));
          } else if (event.type === 'error') {
            setEnrich(prev => ({
              ...prev,
              running: false,
              error: typeof event.message === 'string' ? event.message : 'enrichment error',
            }));
          }
        }
      }
    } catch (e) {
      setEnrich(prev => ({
        ...prev,
        running: false,
        error: e instanceof Error ? e.message : 'enrichment failed',
      }));
    }
  };

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
          {/* Enrich filtered pins via Google Places API. Only enabled
              when there's a filtered set and no run already in flight.
              Cost preview happens in the click handler's confirm()
              dialog before any server traffic. */}
          {filtered.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={enrichVisible}
                disabled={enrich.running}
                className="text-label px-2 py-1 rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1"
                title={
                  enrichRefresh
                    ? 'Re-fetch price level, hours, and phone from Google Places for every filtered pin (overrides prior enrichment).'
                    : 'Fetch price level, hours, and phone from Google Places for filtered pins that haven\'t been enriched yet.'
                }
              >
                <span aria-hidden>✨</span>
                <span>{enrich.running ? 'Enriching…' : `Enrich filtered (${filtered.length})`}</span>
              </button>
              {/* Refresh toggle — when on, the run re-pulls every pin
                  including ones already enriched, so newly-added fields
                  like phone get backfilled without skipping. Off by
                  default to keep accidental clicks cheap. */}
              <label
                className={
                  'inline-flex items-center gap-1 text-label cursor-pointer ' +
                  (enrichRefresh ? 'text-accent' : 'text-muted hover:text-ink')
                }
                title="When on, re-fetches every filtered pin even if it was enriched before. Curated values still win on merge."
              >
                <input
                  type="checkbox"
                  checked={enrichRefresh}
                  onChange={e => setEnrichRefresh(e.target.checked)}
                  disabled={enrich.running}
                  className="w-3 h-3 accent-accent"
                />
                <span>refresh</span>
              </label>
            </span>
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

      {/* Places enrichment status strip — visible while a run is in
          flight or after one finishes. Mirrors the same flat-rounded
          treatment as the save-status pill so it doesn't introduce
          new chrome. */}
      {(enrich.running || enrich.processed > 0 || enrich.error) && (
        <div
          className={
            'px-3 py-2 rounded text-small flex items-center justify-between gap-3 flex-wrap ' +
            (enrich.error
              ? 'bg-orange/10 text-orange'
              : enrich.running
              ? 'bg-accent/10 text-accent'
              : 'bg-teal/10 text-teal')
          }
        >
          <div className="tabular-nums">
            {enrich.error ? (
              <>Enrichment failed: {enrich.error}</>
            ) : (
              <>
                <strong>
                  {enrich.processed}/{enrich.total}
                </strong>{' '}
                processed · <strong>{enrich.enriched}</strong> enriched
                {enrich.skipped > 0 && (
                  <> · <strong>{enrich.skipped}</strong> skipped</>
                )}
                <span className="ml-2">~ ${enrich.cost.toFixed(2)}</span>
                {enrich.abortedAtCap && (
                  <span className="ml-2">(stopped at cost cap)</span>
                )}
              </>
            )}
          </div>
          {enrich.note && !enrich.error && (
            <div className="text-label text-muted truncate max-w-[40ch]">{enrich.note}</div>
          )}
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
