'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// === PinEditDrawer ==========================================================
// Notion-style slide-in editor for a single pin. Opens from the right when
// the admin clicks any card on the list-detail page; closes on Esc, click
// outside, or the X button.
//
// Field set is the high-value "edit while you triage a list" subset:
//   visited, kind, personal_rating, personal_review, visit_year, free,
//   name, description, hours, price_text.
//
// Anything more esoteric (hotel sub-fields, restaurant fields, location
// overrides) lives behind the "Open full editor →" link to
// /admin/pins/[id], which already covers the entire schema.
//
// Save model: autosave on blur per field via /api/admin/update-pin. Inline
// "saving…" / "saved" indicator next to each input. The parent grid gets
// an onChange callback so its card thumbnail updates without a refetch.

export type EditablePin = {
  id: string;
  slug: string | null;
  name: string;
  visited: boolean;
  kind: string | null;
  personalRating: number | null;
  personalReview: string | null;
  visitYear: number | null;
  free: boolean | null;
  description: string | null;
  hours: string | null;
  priceText: string | null;
};

type Props = {
  pin: EditablePin;
  /** Called with the patched fields after each successful save so the
   *  parent can update its local card state without refetching. */
  onChange: (patch: Partial<EditablePin>) => void;
  onClose: () => void;
  /** Called when the admin clicks "Remove from list" — strips this list
   *  from pin.saved_lists. Drawer stays open. */
  onRemoveFromList: () => void | Promise<void>;
  /** Called when the admin clicks "Delete pin" — fully deletes the pin
   *  from the database. Drawer should close after this. */
  onDeletePin: () => void | Promise<void>;
};

const KIND_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: '—' },
  { value: 'attraction', label: 'Attraction' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'park', label: 'Park' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'transit', label: 'Transit' },
];

export default function PinEditDrawer({
  pin,
  onChange,
  onClose,
  onRemoveFromList,
  onDeletePin,
}: Props) {
  // Local draft state — each field commits on blur. We mirror the pin
  // prop into local state because this component owns the inputs and
  // needs to track unsaved keystrokes; saved values come back via
  // onChange() to the parent, which is what re-renders this component
  // when the admin re-opens it for the same pin.
  const [draft, setDraft] = useState<EditablePin>(pin);
  // Track which field is currently saving + which had a recent success
  // for the inline indicator. Map from field key to status.
  type FieldStatus = 'saving' | 'saved' | null;
  const [status, setStatus] = useState<Record<string, FieldStatus>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset draft when the parent swaps to a different pin.
  useEffect(() => {
    setDraft(pin);
    setStatus({});
    setError(null);
  }, [pin.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside to close. Drawer body stops propagation.
  const drawerRef = useRef<HTMLDivElement | null>(null);

  async function commit(
    field: keyof EditablePin,
    apiKey: string,
    value: unknown,
  ) {
    setStatus(s => ({ ...s, [field]: 'saving' }));
    setError(null);
    try {
      const res = await fetch('/api/admin/update-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pin.id, fields: { [apiKey]: value } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save failed');
      onChange({ [field]: value } as Partial<EditablePin>);
      setStatus(s => ({ ...s, [field]: 'saved' }));
      // Clear the "saved" badge after a moment so it doesn't linger.
      setTimeout(() => {
        setStatus(s => (s[field] === 'saved' ? { ...s, [field]: null } : s));
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save failed';
      setError(msg);
      setStatus(s => ({ ...s, [field]: null }));
    }
  }

  /** Commit only when the input has actually changed since last commit. */
  function commitIfChanged<K extends keyof EditablePin>(
    field: K,
    apiKey: string,
    value: EditablePin[K],
  ) {
    if (value === pin[field]) return;
    void commit(field, apiKey, value);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-deep/30 flex justify-end"
      onMouseDown={onClose}
    >
      <aside
        ref={drawerRef}
        onMouseDown={e => e.stopPropagation()}
        className="bg-white w-full max-w-md shadow-paper overflow-y-auto flex flex-col"
        role="dialog"
        aria-label={`Edit ${pin.name}`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-sand flex items-center gap-3">
          <h2 className="text-h3 text-ink-deep flex-1 truncate" title={draft.name}>
            {draft.name}
          </h2>
          <Link
            href={`/admin/pins/${pin.id}`}
            className="text-label text-teal hover:underline whitespace-nowrap"
            title="Open full pin editor"
          >
            Full editor →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-label text-slate hover:text-ink-deep p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="px-5 py-2 bg-orange/10 border-b border-orange/40 text-small text-orange">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 px-5 py-4 space-y-4">
          <Field label="Name" status={status.name}>
            <input
              type="text"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              onBlur={() => commitIfChanged('name', 'name', draft.name.trim())}
              className={inputCls}
            />
          </Field>

          <Field label="Visited">
            <BoolPills
              value={draft.visited}
              onChange={v => {
                setDraft(d => ({ ...d, visited: v }));
                void commit('visited', 'visited', v);
              }}
            />
          </Field>

          <Field label="Kind">
            <select
              value={draft.kind ?? ''}
              onChange={e => {
                const v = e.target.value || null;
                setDraft(d => ({ ...d, kind: v }));
                void commit('kind', 'kind', v);
              }}
              className={inputCls + ' cursor-pointer'}
            >
              {KIND_OPTIONS.map(o => (
                <option key={String(o.value)} value={o.value ?? ''}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Personal rating" status={status.personalRating}>
            <StarPicker
              value={draft.personalRating}
              onChange={v => {
                setDraft(d => ({ ...d, personalRating: v }));
                void commit('personalRating', 'personal_rating', v);
              }}
            />
          </Field>

          <Field label="Personal review" status={status.personalReview}>
            <textarea
              value={draft.personalReview ?? ''}
              onChange={e =>
                setDraft(d => ({ ...d, personalReview: e.target.value }))
              }
              onBlur={() => {
                const next = (draft.personalReview ?? '').trim() || null;
                commitIfChanged('personalReview', 'personal_review', next);
              }}
              rows={4}
              className={inputCls + ' resize-y'}
              placeholder="What was it like? Worth a return?"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Visit year" status={status.visitYear}>
              <input
                type="number"
                min={1900}
                max={2100}
                value={draft.visitYear ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  const next = raw === '' ? null : Number(raw);
                  setDraft(d => ({
                    ...d,
                    visitYear: Number.isFinite(next as number) ? (next as number) : null,
                  }));
                }}
                onBlur={() =>
                  commitIfChanged('visitYear', 'visit_year', draft.visitYear)
                }
                className={inputCls}
                placeholder="2024"
              />
            </Field>
            <Field label="Free entry">
              <BoolPills
                value={draft.free}
                onChange={v => {
                  setDraft(d => ({ ...d, free: v }));
                  void commit('free', 'free', v);
                }}
                allowNull
              />
            </Field>
          </div>

          <Field label="Description" status={status.description}>
            <textarea
              value={draft.description ?? ''}
              onChange={e =>
                setDraft(d => ({ ...d, description: e.target.value }))
              }
              onBlur={() => {
                const next = (draft.description ?? '').trim() || null;
                commitIfChanged('description', 'description', next);
              }}
              rows={3}
              className={inputCls + ' resize-y'}
              placeholder="Short description shown on the public pin page."
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours (free text)" status={status.hours}>
              <input
                type="text"
                value={draft.hours ?? ''}
                onChange={e =>
                  setDraft(d => ({ ...d, hours: e.target.value }))
                }
                onBlur={() => {
                  const next = (draft.hours ?? '').trim() || null;
                  commitIfChanged('hours', 'hours', next);
                }}
                className={inputCls}
                placeholder="Mon-Fri 09:00-17:00"
              />
            </Field>
            <Field label="Price text" status={status.priceText}>
              <input
                type="text"
                value={draft.priceText ?? ''}
                onChange={e =>
                  setDraft(d => ({ ...d, priceText: e.target.value }))
                }
                onBlur={() => {
                  const next = (draft.priceText ?? '').trim() || null;
                  commitIfChanged('priceText', 'price_text', next);
                }}
                className={inputCls}
                placeholder="Free / €15 / $20–30"
              />
            </Field>
          </div>
        </div>

        {/* Footer — destructive actions, separated visually. */}
        <div className="px-5 py-4 border-t border-sand bg-cream-soft/40 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onRemoveFromList()}
            className="text-label text-slate hover:text-orange underline-offset-2 hover:underline"
            title="Remove this pin from the current list (keeps the pin)"
          >
            Remove from list
          </button>
          <button
            type="button"
            onClick={() => onDeletePin()}
            className="ml-auto text-label text-orange hover:text-orange/80 underline-offset-2 hover:underline"
            title="Permanently delete this pin from the database"
          >
            Delete pin
          </button>
        </div>
      </aside>
    </div>
  );
}

// ─── Field wrapper with status indicator ────────────────────────────────────

const inputCls =
  'w-full text-small bg-white border border-sand rounded-md px-3 py-2 ' +
  'focus:outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10';

function Field({
  label,
  status,
  children,
}: {
  label: string;
  status?: 'saving' | 'saved' | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-label text-slate">{label}</span>
        {status === 'saving' && (
          <span className="text-micro text-muted">saving…</span>
        )}
        {status === 'saved' && (
          <span className="text-micro text-teal">saved ✓</span>
        )}
      </div>
      {children}
    </label>
  );
}

// ─── Boolean tri-state pills ────────────────────────────────────────────────

function BoolPills({
  value,
  onChange,
  allowNull = false,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  allowNull?: boolean;
}) {
  const opts: { value: boolean | null; label: string }[] = allowNull
    ? [
        { value: null, label: 'Unknown' },
        { value: true, label: 'Yes' },
        { value: false, label: 'No' },
      ]
    : [
        { value: true, label: 'Yes' },
        { value: false, label: 'No' },
      ];
  return (
    <div className="inline-flex rounded-md border border-sand bg-white p-0.5">
      {opts.map(o => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              'px-3 py-1 rounded text-label font-medium transition-colors ' +
              (active
                ? 'bg-cream-soft text-ink-deep'
                : 'text-slate hover:text-ink-deep')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 5-star clicker ─────────────────────────────────────────────────────────

function StarPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={
              'w-7 h-7 rounded text-h3 leading-none transition-colors ' +
              (filled ? 'text-amber-500' : 'text-sand hover:text-amber-500/70')
            }
            title={value === n ? 'Click again to clear' : `Rate ${n}`}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            ★
          </button>
        );
      })}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-2 text-label text-slate hover:text-orange"
          title="Clear rating"
        >
          clear
        </button>
      )}
    </div>
  );
}
