'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';
import PinEditDrawer, { type EditablePin } from './PinEditDrawer';

// === AdminListEditor =======================================================
// Owns the list-detail admin view. Three concerns:
//
//   1. Card grid — same shape as /lists/[slug]'s SavedListSection cards but
//      every card is admin-clickable. Clicking opens PinEditDrawer for the
//      pin; hovering reveals a "✕ Remove from list" affordance.
//
//   2. PinEditDrawer — the drawer is mounted/unmounted by this component,
//      and it pipes save commits back through `onChange` so the card
//      thumbnail updates without a refetch.
//
//   3. AddPinModal (inline below) — opens when the user clicks the
//      + Add pin button, lets them search the global pin corpus and add
//      any non-member to this list.
//
// Stats are computed client-side from the in-memory member set so they
// update instantly when the admin toggles visited / adds a pin / removes
// a pin without a server round-trip beyond the actual save call.

export type AdminPinRow = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  /** Cover image URL — first images[0] or null. */
  cover: string | null;
  /** Editable fields the drawer mirrors. */
  visited: boolean;
  kind: string | null;
  personalRating: number | null;
  personalReview: string | null;
  visitYear: number | null;
  free: boolean | null;
  description: string | null;
  hours: string | null;
  priceText: string | null;
  /** True when this pin currently has the active list in saved_lists.
   *  The admin grid shows only members; the AddPinModal shows non-members. */
  isMember: boolean;
  /** Saved-list-import draft pins (no coords + no geo) — visually flagged
   *  in the modal so the admin doesn't confuse them for curated entries. */
  isDraft: boolean;
};

type Props = {
  listName: string;
  initialRows: AdminPinRow[];
};

export default function AdminListEditor({ listName, initialRows }: Props) {
  const [rows, setRows] = useState<AdminPinRow[]>(initialRows);
  const [openPinId, setOpenPinId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const members = useMemo(() => rows.filter(r => r.isMember), [rows]);
  const nonMembers = useMemo(() => rows.filter(r => !r.isMember), [rows]);

  const memberCount = members.length;
  const visitedCount = members.filter(r => r.visited).length;
  const reviewedCount = members.filter(r => r.personalReview && r.personalReview.trim()).length;
  const ratedPins = members.filter(
    r => r.personalRating != null && r.personalRating > 0,
  );
  const avgRating = ratedPins.length
    ? ratedPins.reduce((acc, r) => acc + (r.personalRating ?? 0), 0) /
      ratedPins.length
    : null;

  const openPin = useMemo(
    () => (openPinId ? rows.find(r => r.id === openPinId) ?? null : null),
    [openPinId, rows],
  );

  function patchRow(id: string, patch: Partial<AdminPinRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function toggleMembership(pinId: string, nextState: boolean) {
    setFlash(null);
    // Optimistic flip.
    patchRow(pinId, { isMember: nextState });
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
      // Roll back on failure.
      patchRow(pinId, { isMember: !nextState });
      setFlash(e instanceof Error ? e.message : 'toggle failed');
    }
  }

  async function deletePin(pinId: string, pinName: string) {
    if (
      !window.confirm(
        `Permanently delete "${pinName}" from the database?\n\n` +
        `This removes the pin everywhere — not just from this list. ` +
        `Personal photos attached to it go too. This can't be undone.`,
      )
    ) {
      return;
    }
    setFlash(null);
    try {
      const res = await fetch('/api/admin/delete-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'delete failed');
      // Drop the row from local state. The drawer was tied to this id;
      // close it.
      setRows(prev => prev.filter(r => r.id !== pinId));
      setOpenPinId(null);
      setFlash(`Deleted "${pinName}".`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'delete failed');
    }
  }

  return (
    <section>
      {/* Stats row + actions. Mirrors /lists/[slug]'s stats line so the
          admin's mental model lines up with what visitors see. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-small text-slate tabular-nums mb-4">
        <span>
          <strong className="text-ink-deep">{memberCount}</strong>{' '}
          {memberCount === 1 ? 'pin' : 'pins'}
        </span>
        {visitedCount > 0 && (
          <span>
            <strong className="text-ink-deep">{visitedCount}</strong> visited
          </span>
        )}
        {reviewedCount > 0 && (
          <span>
            <strong className="text-ink-deep">{reviewedCount}</strong> reviewed
          </span>
        )}
        {avgRating != null && (
          <span>
            <strong className="text-ink-deep">{avgRating.toFixed(1)}</strong>
            <span className="text-muted">&nbsp;avg ⭐</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="ml-auto px-3 py-1.5 rounded-md border border-sand text-small text-ink-deep hover:border-slate hover:bg-cream-soft transition-colors"
        >
          + Add pin to list
        </button>
      </div>

      {flash && (
        <div className="mb-4 px-3 py-2 rounded bg-cream-soft border border-sand text-small text-ink">
          {flash}
        </div>
      )}

      {/* Card grid — same column counts as /lists/[slug]. */}
      {members.length === 0 ? (
        <div className="card p-8 text-center text-slate text-small">
          No pins on this list yet. Click <strong>+ Add pin to list</strong> to start adding.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {members.map(r => (
            <PinCard
              key={r.id}
              row={r}
              onOpen={() => setOpenPinId(r.id)}
              onRemove={() => toggleMembership(r.id, false)}
            />
          ))}
        </ul>
      )}

      {/* Drawer — only mounted when a pin is selected so the inputs reset
          on each open. */}
      {openPin && (
        <PinEditDrawer
          pin={pinToEditable(openPin)}
          onChange={patch => patchRow(openPin.id, editableToPatch(patch))}
          onClose={() => setOpenPinId(null)}
          onRemoveFromList={async () => {
            await toggleMembership(openPin.id, false);
            setOpenPinId(null);
          }}
          onDeletePin={() => deletePin(openPin.id, openPin.name)}
        />
      )}

      {showAdd && (
        <AddPinModal
          listName={listName}
          nonMembers={nonMembers}
          onAdd={async pinId => {
            await toggleMembership(pinId, true);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </section>
  );
}

// ─── Pin card ───────────────────────────────────────────────────────────────

function PinCard({
  row,
  onOpen,
  onRemove,
}: {
  row: AdminPinRow;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left card overflow-hidden hover:shadow-paper transition-shadow"
      >
        {row.cover ? (
          <div className="relative aspect-[4/3] bg-cream-soft overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(row.cover, { size: 400 }) ?? row.cover}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {row.visited && (
              <span className="absolute top-1.5 left-1.5 pill bg-teal text-white text-micro shadow">
                ✓
              </span>
            )}
          </div>
        ) : (
          <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
            No photo
          </div>
        )}
        <div className="p-3">
          <h3 className="text-ink-deep font-medium leading-tight truncate">
            {row.name}
          </h3>
          {(row.city || row.country) && (
            <p className="mt-0.5 text-label text-muted truncate">
              {[row.city, row.country].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="mt-1 text-label text-slate flex items-center gap-1.5 tabular-nums">
            {row.personalRating != null && row.personalRating > 0 && (
              <span className="text-amber-500">
                {'★'.repeat(row.personalRating)}
              </span>
            )}
            {row.visitYear != null && (
              <span className="text-muted">{row.visitYear}</span>
            )}
          </p>
          {row.personalReview && (
            <p className="mt-1 text-label text-slate line-clamp-2">
              {row.personalReview}
            </p>
          )}
        </div>
      </button>
      {/* Remove-from-list affordance. Hidden until hover so the card stays
          visually quiet, then surfaces in the corner. Stops propagation
          so the click doesn't open the drawer. */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onRemove();
        }}
        title={`Remove "${row.name}" from this list (keeps the pin)`}
        aria-label={`Remove ${row.name} from list`}
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-orange text-white text-small leading-none
                   flex items-center justify-center ring-2 ring-white shadow-md
                   opacity-0 group-hover:opacity-100 hover:bg-orange/90 hover:scale-110 transition-all"
      >
        ✕
      </button>
    </li>
  );
}

// ─── AddPinModal ────────────────────────────────────────────────────────────
// Searches the non-members set, click row to add. Compact list — paginated
// like the previous ListDetailClient roster but read-only with a single
// "Add" action per row instead of toggle-checkboxes.

function AddPinModal({
  listName,
  nonMembers,
  onAdd,
  onClose,
}: {
  listName: string;
  nonMembers: AdminPinRow[];
  onAdd: (pinId: string) => Promise<void>;
  onClose: () => void;
}) {
  const PAGE_SIZE = 100;
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nonMembers;
    return nonMembers.filter(r =>
      `${r.name} ${r.city ?? ''} ${r.country ?? ''}`.toLowerCase().includes(q),
    );
  }, [nonMembers, query]);

  const visible = filtered.slice(0, shown);
  const remaining = Math.max(0, filtered.length - visible.length);

  async function add(pinId: string) {
    setBusyIds(prev => new Set(prev).add(pinId));
    try {
      await onAdd(pinId);
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(pinId);
        return next;
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-deep/40 flex items-center justify-center p-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-paper max-w-2xl w-full max-h-[85vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-sand flex items-center gap-3">
          <h2 className="text-h3 text-ink-deep capitalize flex-1">
            Add to {listName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-label text-slate hover:text-ink-deep p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-3 border-b border-sand">
          <input
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setShown(PAGE_SIZE);
            }}
            placeholder="Search non-member pins by name, city, or country…"
            className="w-full text-small border border-sand rounded px-3 py-2 bg-white focus:outline-none focus:border-ink-deep"
            autoFocus
          />
          <p className="mt-2 text-label text-muted tabular-nums">
            {filtered.length === nonMembers.length
              ? `${nonMembers.length} pins available`
              : `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-sand/60">
            {visible.length === 0 && (
              <li className="px-5 py-8 text-center text-slate text-small">
                {query ? 'No pins match that search.' : 'No more pins to add.'}
              </li>
            )}
            {visible.map(r => {
              const busy = busyIds.has(r.id);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-5 py-2.5"
                >
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
                  <button
                    type="button"
                    onClick={() => add(r.id)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded text-label font-medium bg-ink-deep text-white hover:bg-ink-deep/90 disabled:opacity-50"
                  >
                    {busy ? 'Adding…' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
          {remaining > 0 && (
            <div className="py-4 text-center">
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
      </div>
    </div>
  );
}

// ─── Mappers between AdminPinRow and the drawer's EditablePin shape ─────────

function pinToEditable(r: AdminPinRow): EditablePin {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    visited: r.visited,
    kind: r.kind,
    personalRating: r.personalRating,
    personalReview: r.personalReview,
    visitYear: r.visitYear,
    free: r.free,
    description: r.description,
    hours: r.hours,
    priceText: r.priceText,
  };
}

function editableToPatch(patch: Partial<EditablePin>): Partial<AdminPinRow> {
  // Same shape — narrow cast keeps the AdminListEditor's row state in sync
  // with the drawer's edits.
  return patch as Partial<AdminPinRow>;
}
