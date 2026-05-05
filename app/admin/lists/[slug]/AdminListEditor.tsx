'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { thumbUrl } from '@/lib/imageUrl';

// === AdminListEditor =======================================================
// Public-page-shaped editor where every card IS the editor — no drawer, no
// modal jumping. Click any field on a card (name, stars, review, year, free
// chip, visited check) and it flips into an inline input that autosaves on
// blur via /api/admin/update-pin. Click outside or hit Enter/Esc to exit
// edit mode. Stats at the top of the section recompute on every save.
//
// Hover-✕ in each card's corner removes the pin from the active list
// (without deleting the pin). + Add pin to list opens a modal that
// searches the non-member set and adds with one click.
//
// Fields that don't fit a card cell (description, hours, price text,
// hotel sub-fields, etc.) live behind the "Full editor →" link in each
// card's footer — they're rare enough that the round-trip is acceptable.
//
// Pattern is intentionally re-usable: same template will land on
// /admin/cities/[slug] and /admin/countries/[slug] in follow-ups.

export type AdminPinRow = {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  country: string | null;
  cover: string | null;
  visited: boolean;
  kind: string | null;
  personalRating: number | null;
  personalReview: string | null;
  visitYear: number | null;
  free: boolean | null;
  description: string | null;
  hours: string | null;
  priceText: string | null;
  isMember: boolean;
  isDraft: boolean;
};

type Props = {
  listName: string;
  initialRows: AdminPinRow[];
};

export default function AdminListEditor({ listName, initialRows }: Props) {
  const [rows, setRows] = useState<AdminPinRow[]>(initialRows);
  const [showAdd, setShowAdd] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Drag-reorder state: which pin id is currently being dragged, and
  // which pin id is the current hover target (for the drop indicator).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const members = useMemo(() => rows.filter(r => r.isMember), [rows]);
  const nonMembers = useMemo(() => rows.filter(r => !r.isMember), [rows]);

  const memberCount = members.length;
  const visitedCount = members.filter(r => r.visited).length;
  const reviewedCount = members.filter(
    r => r.personalReview && r.personalReview.trim(),
  ).length;
  const ratedPins = members.filter(
    r => r.personalRating != null && r.personalRating > 0,
  );
  const avgRating = ratedPins.length
    ? ratedPins.reduce((acc, r) => acc + (r.personalRating ?? 0), 0) /
      ratedPins.length
    : null;

  function patchRow(id: string, patch: Partial<AdminPinRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function toggleMembership(pinId: string, nextState: boolean) {
    setFlash(null);
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
      patchRow(pinId, { isMember: !nextState });
      setFlash(e instanceof Error ? e.message : 'toggle failed');
    }
  }

  // === Drag reorder ========================================================
  // Native HTML5 drag-and-drop. Each card sets a drag handle (the grip icon
  // top-right of the cover) so accidental drags from a click on the title
  // or stars don't fire. We compute the new order on drop, optimistically
  // reflect it in local state, then POST setPinOrder. On failure we revert
  // to the previous order.
  async function commitOrder(orderedIds: string[]) {
    setSavingOrder(true);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'setPinOrder',
          name: listName,
          pinIds: orderedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'order save failed');
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'order save failed');
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setHoverId(null);
      return;
    }
    // Reorder rows so that draggingId moves to the position of targetId.
    // We operate on the full rows array (not just members) so the
    // member-only render is consistent with what's stored.
    setRows(prev => {
      const next = prev.slice();
      const fromIdx = next.findIndex(r => r.id === draggingId);
      const toIdx = next.findIndex(r => r.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = next.splice(fromIdx, 1);
      // Recompute toIdx after the splice — if we were dragging earlier
      // in the array, the target shifted up by one.
      const adjusted = fromIdx < toIdx ? toIdx - 1 : toIdx;
      next.splice(adjusted, 0, moved);
      // Persist member-only order to the server.
      const orderedMemberIds = next.filter(r => r.isMember).map(r => r.id);
      void commitOrder(orderedMemberIds);
      return next;
    });
    setDraggingId(null);
    setHoverId(null);
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
      setRows(prev => prev.filter(r => r.id !== pinId));
      setFlash(`Deleted "${pinName}".`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'delete failed');
    }
  }

  return (
    <section>
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

      {members.length === 0 ? (
        <div className="card p-8 text-center text-slate text-small">
          No pins on this list yet. Click <strong>+ Add pin to list</strong> to start adding.
        </div>
      ) : (
        <>
          <p className="text-label text-muted mb-2 flex items-center gap-2">
            <span>Tip: drag the ⋮⋮ handle on any card to reorder.</span>
            {savingOrder && <span className="text-teal">saving order…</span>}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map(r => (
              <EditableCard
                key={r.id}
                row={r}
                isDragging={draggingId === r.id}
                isDropTarget={hoverId === r.id && draggingId !== r.id}
                onDragStart={() => setDraggingId(r.id)}
                onDragOver={() => {
                  if (draggingId && draggingId !== r.id) setHoverId(r.id);
                }}
                onDragLeave={() => {
                  if (hoverId === r.id) setHoverId(null);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setHoverId(null);
                }}
                onDrop={() => handleDrop(r.id)}
                onPatch={patch => patchRow(r.id, patch)}
                onRemoveFromList={() => toggleMembership(r.id, false)}
                onDeletePin={() => deletePin(r.id, r.name)}
              />
            ))}
          </ul>
        </>
      )}

      {showAdd && (
        <AddPinModal
          listName={listName}
          nonMembers={nonMembers}
          onAdd={pinId => toggleMembership(pinId, true)}
          onClose={() => setShowAdd(false)}
        />
      )}
    </section>
  );
}

// ─── EditableCard ───────────────────────────────────────────────────────────
// Each card carries its own draft state + editing-field flag. Save calls
// hit /api/admin/update-pin with just the changed field.

type EditField =
  | null
  | 'name'
  | 'review'
  | 'visitYear'
  | 'city'
  | 'country';

function EditableCard({
  row,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
  onPatch,
  onRemoveFromList,
  onDeletePin,
}: {
  row: AdminPinRow;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onPatch: (patch: Partial<AdminPinRow>) => void;
  onRemoveFromList: () => void;
  onDeletePin: () => void;
}) {
  const [editing, setEditing] = useState<EditField>(null);
  // Per-field saving indicator for non-text-input fields (stars, free, visited)
  // where blur isn't the trigger and we want a brief "saved ✓" flash.
  type Status = 'saving' | 'saved' | null;
  const [status, setStatus] = useState<Record<string, Status>>({});

  async function save(apiKey: string, jsField: keyof AdminPinRow, value: unknown) {
    setStatus(s => ({ ...s, [apiKey]: 'saving' }));
    try {
      const res = await fetch('/api/admin/update-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, fields: { [apiKey]: value } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save failed');
      onPatch({ [jsField]: value } as Partial<AdminPinRow>);
      setStatus(s => ({ ...s, [apiKey]: 'saved' }));
      setTimeout(() => {
        setStatus(s => (s[apiKey] === 'saved' ? { ...s, [apiKey]: null } : s));
      }, 1200);
    } catch (e) {
      setStatus(s => ({ ...s, [apiKey]: null }));
      window.alert(e instanceof Error ? e.message : 'save failed');
    }
  }

  return (
    <li
      onDragOver={e => {
        // Only react when something is actually being dragged (preventDefault
        // signals to the browser that the drop is allowed).
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={e => {
        e.preventDefault();
        onDrop();
      }}
      className={
        'relative group card overflow-hidden transition-all ' +
        (isDragging ? 'opacity-40 scale-[0.98] ' : '') +
        (isDropTarget ? 'ring-2 ring-teal ring-offset-2 ring-offset-white ' : '')
      }
    >
      {/* Cover + status chips overlaid on top */}
      <div className="relative">
        {row.cover ? (
          <div className="aspect-[4/3] bg-cream-soft overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(row.cover, { size: 600 }) ?? row.cover}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-[4/3] bg-cream-soft border-b border-sand flex items-center justify-center text-muted text-micro uppercase tracking-wider">
            No photo
          </div>
        )}
        {/* Drag handle — only the handle is `draggable`, so accidental drags
            from the title / stars / review text don't fire. The handle has
            `cursor-grab` for affordance and shows always (not hover-only)
            so the reorder mechanic is discoverable. */}
        <div
          draggable
          onDragStart={e => {
            // setData required for Firefox to fire dragstart at all.
            e.dataTransfer?.setData('text/plain', row.id);
            e.dataTransfer.effectAllowed = 'move';
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-label={`Reorder ${row.name}`}
          className="absolute top-2 right-12 w-7 h-7 rounded-md bg-white/85 hover:bg-white text-slate hover:text-ink-deep
                     flex items-center justify-center cursor-grab active:cursor-grabbing shadow backdrop-blur-sm
                     opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="text-prose leading-none select-none">⋮⋮</span>
        </div>
        {/* Visited toggle — top-left chip. Click cycles on/off and saves. */}
        <ToggleChip
          on={row.visited}
          onChange={v => save('visited', 'visited', v)}
          status={status.visited}
          posClass="top-2 left-2"
          onLabel="✓ Visited"
          offLabel="Mark visited"
        />
        {/* Free chip — top-right when set; faint placeholder when null. */}
        <FreeChip
          value={row.free}
          onChange={v => save('free', 'free', v)}
          status={status.free}
        />
        {/* Hover-only ✕ — removes from list (different from delete pin). */}
        <button
          type="button"
          onClick={onRemoveFromList}
          title={`Remove "${row.name}" from this list (keeps the pin)`}
          aria-label={`Remove ${row.name} from list`}
          className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-orange text-white text-small leading-none
                     flex items-center justify-center ring-2 ring-white shadow-md
                     opacity-0 group-hover:opacity-100 hover:bg-orange/90 hover:scale-110 transition-all"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-1.5">
        {/* Name — click to edit. */}
        {editing === 'name' ? (
          <InlineInput
            initial={row.name}
            onCommit={v => {
              setEditing(null);
              const next = v.trim();
              if (next && next !== row.name) save('name', 'name', next);
            }}
            onCancel={() => setEditing(null)}
            className="text-ink-deep font-medium leading-tight w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing('name')}
            className="text-ink-deep font-medium leading-tight text-left w-full hover:bg-cream-soft rounded -mx-1 px-1 -my-0.5 py-0.5 transition-colors"
            title="Click to rename"
          >
            {row.name}
          </button>
        )}

        {/* City · Country — readonly geo line. Edits live on the full pin
            page since they touch the city/country relations. */}
        {(row.city || row.country) && (
          <p className="text-label text-muted truncate">
            {[row.city, row.country].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Star rating — always click-to-edit (no separate "edit" mode
            needed; tap a star to set, tap the same one again to clear). */}
        <div className="flex items-center gap-2 flex-wrap">
          <StarPicker
            value={row.personalRating}
            onChange={v => save('personal_rating', 'personalRating', v)}
          />
          <YearField
            value={row.visitYear}
            editing={editing === 'visitYear'}
            onEdit={() => setEditing('visitYear')}
            onCommit={v => {
              setEditing(null);
              if (v !== row.visitYear) save('visit_year', 'visitYear', v);
            }}
            onCancel={() => setEditing(null)}
          />
          <SaveDot show={status.personalRating === 'saved'} />
        </div>

        {/* Personal review — click to edit, expands to a textarea. */}
        {editing === 'review' ? (
          <InlineTextarea
            initial={row.personalReview ?? ''}
            onCommit={v => {
              setEditing(null);
              const next = v.trim() || null;
              if (next !== row.personalReview)
                save('personal_review', 'personalReview', next);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : row.personalReview ? (
          <button
            type="button"
            onClick={() => setEditing('review')}
            className="text-label text-slate text-left w-full hover:bg-cream-soft rounded -mx-1 px-1 py-0.5 transition-colors line-clamp-3"
            title="Click to edit review"
          >
            {row.personalReview}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing('review')}
            className="text-label text-muted/80 italic hover:text-slate"
          >
            Add review…
          </button>
        )}

        <SaveDot show={status.personal_review === 'saved'} />

        {/* Footer row — full editor + delete + draft tag. */}
        <div className="pt-2 mt-1 border-t border-sand/60 flex items-center gap-3 text-micro">
          <Link
            href={`/admin/pins/${row.id}`}
            className="text-teal hover:underline"
            title="Open the full pin editor for description, hours, price, hotel/restaurant fields, etc."
          >
            Full editor →
          </Link>
          {row.slug && (
            <Link
              href={`/pins/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate hover:text-ink-deep"
            >
              Public ↗
            </Link>
          )}
          {row.isDraft && (
            <span
              className="pill bg-cream-soft border border-sand text-slate"
              title="Imported from Google saved list — no coords yet"
            >
              draft
            </span>
          )}
          <button
            type="button"
            onClick={onDeletePin}
            className="ml-auto text-orange hover:text-orange/80 underline-offset-2 hover:underline"
            title="Permanently delete this pin"
          >
            Delete pin
          </button>
        </div>
      </div>
    </li>
  );
}

// ─── Inline editing primitives ──────────────────────────────────────────────

function InlineInput({
  initial,
  onCommit,
  onCancel,
  className = '',
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onCommit(value);
        if (e.key === 'Escape') onCancel();
      }}
      className={
        className +
        ' bg-white border border-ink-deep rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-ink-deep/20'
      }
    />
  );
}

function InlineTextarea({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const len = ref.current?.value.length ?? 0;
    ref.current?.setSelectionRange(len, len);
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onCommit(value);
        if (e.key === 'Escape') onCancel();
      }}
      rows={4}
      placeholder="What was it like? Worth a return?"
      className="w-full text-label text-slate bg-white border border-ink-deep rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-ink-deep/20 resize-y"
    />
  );
}

// ─── Click-to-edit primitives ───────────────────────────────────────────────

function YearField({
  value,
  editing,
  onEdit,
  onCommit,
  onCancel,
}: {
  value: number | null;
  editing: boolean;
  onEdit: () => void;
  onCommit: (v: number | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : '');
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) {
      setDraft(value != null ? String(value) : '');
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        min={1900}
        max={2100}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const n = draft === '' ? null : Number(draft);
          onCommit(Number.isFinite(n as number) ? (n as number | null) : null);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const n = draft === '' ? null : Number(draft);
            onCommit(Number.isFinite(n as number) ? (n as number | null) : null);
          }
          if (e.key === 'Escape') onCancel();
        }}
        className="w-16 text-label tabular-nums bg-white border border-ink-deep rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-ink-deep/20"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      title="Visit year (click to edit)"
      className={
        'text-label tabular-nums px-1.5 py-0.5 rounded transition-colors ' +
        (value != null
          ? 'text-muted hover:bg-cream-soft'
          : 'text-muted/60 italic hover:text-slate hover:bg-cream-soft')
      }
    >
      {value != null ? value : 'add year'}
    </button>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <span
      className="inline-flex items-center"
      title="Click a star to rate; click the same star again to clear"
    >
      {[1, 2, 3, 4, 5].map(n => {
        const filled = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={
              'w-5 h-5 rounded text-prose leading-none transition-colors ' +
              (filled
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-sand hover:text-amber-500/70')
            }
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            ★
          </button>
        );
      })}
    </span>
  );
}

function ToggleChip({
  on,
  onChange,
  posClass,
  onLabel,
  offLabel,
  status,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  posClass: string;
  onLabel: string;
  offLabel: string;
  status?: 'saving' | 'saved' | null;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={
        'absolute pill text-micro shadow backdrop-blur-sm transition-all ' +
        posClass +
        ' ' +
        (on
          ? 'bg-teal text-white hover:bg-teal/90'
          : 'bg-white/80 text-slate hover:bg-white border border-sand opacity-0 group-hover:opacity-100')
      }
      title={on ? 'Click to mark unvisited' : 'Click to mark visited'}
    >
      {status === 'saving' ? '…' : status === 'saved' ? '✓' : on ? onLabel : offLabel}
    </button>
  );
}

function FreeChip({
  value,
  onChange,
  status,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  status?: 'saving' | 'saved' | null;
}) {
  // Cycle: null → true → false → null
  const next = value === null ? true : value === true ? false : null;
  const label =
    status === 'saving'
      ? '…'
      : value === true
        ? 'Free'
        : value === false
          ? 'Paid'
          : 'Free?';
  const styles =
    value === true
      ? 'bg-teal/90 text-white'
      : value === false
        ? 'bg-slate/80 text-white'
        : 'bg-white/80 text-slate border border-sand opacity-0 group-hover:opacity-100';
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className={
        'absolute top-2 right-2 pill text-micro shadow backdrop-blur-sm transition-all ' +
        styles
      }
      title={
        value === true
          ? 'Free entry — click for Paid'
          : value === false
            ? 'Paid — click for Unknown'
            : 'Unknown — click for Free'
      }
    >
      {label}
    </button>
  );
}

function SaveDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-block text-micro text-teal" aria-live="polite">
      saved ✓
    </span>
  );
}

// ─── AddPinModal ────────────────────────────────────────────────────────────

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
