'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// === ListDetailClient ======================================================
// Searchable, toggleable roster of every pin for one saved list. Members
// are pre-checked; clicking the checkbox flips membership via the
// /api/admin/saved-list addPin/removePin endpoints. The local state
// updates optimistically — server confirmation rolls back on error.
//
// Render strategy: 5K rows is too many to paint up front, so we filter
// down to the search-matched set (or the members-only set when the
// "Members only" toggle is on) and only render the first PAGE_SIZE
// matches with a "Load more" button. Members float to the top of the
// member-only / unfiltered views, so the checkboxes the admin most cares
// about (current members) are always visible.

export type ListDetailPin = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  visited: boolean;
  /** True for saved-list-import drafts that lack coords + geo. Lets the
   *  editor visually flag them so they're not mistaken for curated pins. */
  isDraft: boolean;
  isMember: boolean;
};

type Props = {
  listName: string;
  initialRows: ListDetailPin[];
};

const PAGE_SIZE = 100;

export default function ListDetailClient({ listName, initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);
  // Pin IDs the user is currently mid-toggling — used to disable the
  // checkbox + show a small spinner state without re-rendering everything.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE_SIZE);
  const [flash, setFlash] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (membersOnly && !r.isMember) return false;
      if (!q) return true;
      const haystack = `${r.name} ${r.city ?? ''} ${r.country ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, membersOnly]);

  const visible = filtered.slice(0, shown);
  const remaining = Math.max(0, filtered.length - visible.length);

  const memberCount = rows.filter(r => r.isMember).length;
  const matchedMembers = filtered.filter(r => r.isMember).length;

  async function toggle(pinId: string, nextState: boolean) {
    setBusyIds(prev => {
      const next = new Set(prev);
      next.add(pinId);
      return next;
    });
    setFlash(null);
    // Optimistic local flip.
    setRows(prev => prev.map(r => (r.id === pinId ? { ...r, isMember: nextState } : r)));
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: nextState ? 'addPin' : 'removePin',
          name: listName,
          pinId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'toggle failed');
    } catch (e) {
      // Roll back the optimistic flip.
      setRows(prev => prev.map(r => (r.id === pinId ? { ...r, isMember: !nextState } : r)));
      setFlash(e instanceof Error ? e.message : 'toggle failed');
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(pinId);
        return next;
      });
    }
  }

  // Permanent pin delete from inside the list editor — useful when a draft
  // pin (Google saved-list import without coords) is clearly junk and the
  // admin would otherwise have to bounce to /admin/pins/<id> to nuke it.
  async function deletePin(pinId: string, pinName: string) {
    if (!window.confirm(
      `Permanently delete "${pinName}" from the database? ` +
      `This removes the pin everywhere — not just from this list. ` +
      `Personal photos attached to it go too.`,
    )) return;
    setBusyIds(prev => {
      const next = new Set(prev);
      next.add(pinId);
      return next;
    });
    setFlash(null);
    try {
      const res = await fetch('/api/admin/delete-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'delete failed');
      // Drop the row from the local roster.
      setRows(prev => prev.filter(r => r.id !== pinId));
      setFlash(`Deleted "${pinName}".`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(pinId);
        return next;
      });
    }
  }

  return (
    <div>
      {/* Toolbar: search + members-only toggle + counts. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setShown(PAGE_SIZE); // reset paging on new query
          }}
          placeholder="Search pins by name, city, or country…"
          className="flex-1 max-w-md text-small border border-sand rounded px-3 py-2 bg-white focus:outline-none focus:border-ink-deep"
        />
        <label className="inline-flex items-center gap-2 text-small text-ink-deep select-none cursor-pointer">
          <input
            type="checkbox"
            checked={membersOnly}
            onChange={e => {
              setMembersOnly(e.target.checked);
              setShown(PAGE_SIZE);
            }}
          />
          Members only
        </label>
        <span className="text-label text-muted tabular-nums ml-auto">
          {filtered.length === rows.length
            ? `${memberCount} on list / ${rows.length} pins`
            : `${matchedMembers} on list · ${filtered.length} matches / ${rows.length} pins`}
        </span>
      </div>

      {flash && (
        <div className="mb-4 px-3 py-2 rounded bg-cream-soft border border-sand text-small text-ink">
          {flash}
        </div>
      )}

      {/* Roster. Members render with a teal pill; non-members are muted.
          Clicking the row anywhere outside the link toggles via the
          checkbox to keep the affordance close to the action. */}
      <ul className="card divide-y divide-sand/60">
        {visible.length === 0 && (
          <li className="px-4 py-6 text-center text-slate text-small">
            {query ? 'No pins match that search.' : 'No pins to show.'}
          </li>
        )}
        {visible.map(r => {
          const busy = busyIds.has(r.id);
          return (
            <li
              key={r.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                r.isMember ? 'bg-cream-soft/40' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={r.isMember}
                disabled={busy}
                onChange={e => toggle(r.id, e.target.checked)}
                aria-label={`${r.isMember ? 'Remove from' : 'Add to'} ${listName}`}
                className="h-4 w-4 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={r.slug ? `/pins/${r.slug}` : `/pins/${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-deep hover:underline truncate"
                  >
                    {r.name}
                  </Link>
                  {r.visited && (
                    <span className="pill bg-teal text-white text-micro">✓</span>
                  )}
                  {r.isDraft && (
                    <span
                      className="pill bg-cream-soft border border-sand text-micro text-slate"
                      title="Imported from Google saved list — no coords yet"
                    >
                      draft
                    </span>
                  )}
                </div>
                {(r.city || r.country) && (
                  <p className="text-label text-muted truncate">
                    {[r.city, r.country].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <Link
                href={`/admin/pins/${r.id}`}
                className="text-label text-slate hover:text-ink-deep"
              >
                Edit pin
              </Link>
              <button
                type="button"
                onClick={() => deletePin(r.id, r.name)}
                disabled={busyIds.has(r.id)}
                className="text-label text-orange hover:text-orange/80 disabled:opacity-50"
                title="Permanently delete this pin"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>

      {remaining > 0 && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShown(s => s + PAGE_SIZE)}
            className="px-4 py-2 rounded-md border border-sand text-small text-ink-deep hover:border-slate hover:bg-cream-soft transition-colors"
          >
            Show {Math.min(PAGE_SIZE, remaining)} more
            <span className="text-muted ml-2 tabular-nums">({remaining} left)</span>
          </button>
        </div>
      )}
    </div>
  );
}
