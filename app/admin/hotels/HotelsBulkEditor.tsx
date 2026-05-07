'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// === HotelsBulkEditor ======================================================
// Flat table of every hotel pin with inline-editable price / points / stay
// metadata. Saves go through /api/admin/bulk-edit-pins, which whitelists
// these exact fields and writes them per-row in parallel.

type Row = {
  id: string;
  name: string;
  slug: string | null;
  city: string;
  country: string;
  visitYear: number | null;
  nightsStayed: number | null;
  roomType: string | null;
  roomPricePerNight: number | null;
  roomPriceCurrency: string | null;
  pointsAmount: number | null;
  pointsProgram: string | null;
  personalRating: number | null;
  hasReview: boolean;
};

type RowEdit = {
  visitYear: number | null;
  nightsStayed: number | null;
  roomType: string | null;
  roomPricePerNight: number | null;
  roomPriceCurrency: string | null;
  pointsAmount: number | null;
  pointsProgram: string | null;
  personalRating: number | null;
};

const POINTS_PROGRAMS = ['ihg', 'marriott', 'hyatt', 'hilton'] as const;

function rowToEdit(r: Row): RowEdit {
  return {
    visitYear: r.visitYear,
    nightsStayed: r.nightsStayed,
    roomType: r.roomType,
    roomPricePerNight: r.roomPricePerNight,
    roomPriceCurrency: r.roomPriceCurrency,
    pointsAmount: r.pointsAmount,
    pointsProgram: r.pointsProgram,
    personalRating: r.personalRating,
  };
}

function editsEqual(a: RowEdit, b: RowEdit): boolean {
  return (
    a.visitYear === b.visitYear &&
    a.nightsStayed === b.nightsStayed &&
    a.roomType === b.roomType &&
    a.roomPricePerNight === b.roomPricePerNight &&
    a.roomPriceCurrency === b.roomPriceCurrency &&
    a.pointsAmount === b.pointsAmount &&
    a.pointsProgram === b.pointsProgram &&
    a.personalRating === b.personalRating
  );
}

// Camel → snake mapper for the bulk-edit endpoint payload.
const PATCH_KEYS: Record<keyof RowEdit, string> = {
  visitYear: 'visit_year',
  nightsStayed: 'nights_stayed',
  roomType: 'room_type',
  roomPricePerNight: 'room_price_per_night',
  roomPriceCurrency: 'room_price_currency',
  pointsAmount: 'points_amount',
  pointsProgram: 'points_program',
  personalRating: 'personal_rating',
};

export default function HotelsBulkEditor({ initialRows }: { initialRows: Row[] }) {
  const [rows] = useState(initialRows);
  const [originalEdits] = useState<Map<string, RowEdit>>(
    () => new Map(initialRows.map(r => [r.id, rowToEdit(r)])),
  );
  const [current, setCurrent] = useState<Map<string, RowEdit>>(
    () => new Map(initialRows.map(r => [r.id, rowToEdit(r)])),
  );
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ updated: number; errors?: string[] } | null>(null);

  const updateField = <K extends keyof RowEdit>(id: string, key: K, value: RowEdit[K]) => {
    setCurrent(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (!existing) return prev;
      next.set(id, { ...existing, [key]: value });
      return next;
    });
  };

  const dirty = useMemo(() => {
    const out: string[] = [];
    for (const [id, edit] of current) {
      const orig = originalEdits.get(id);
      if (!orig || !editsEqual(orig, edit)) out.push(id);
    }
    return out;
  }, [current, originalEdits]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.country) set.add(r.country);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (country && r.country !== country) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.city.toLowerCase().includes(needle) ||
        r.country.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, country]);

  const reset = () => {
    setCurrent(new Map([...originalEdits].map(([id, e]) => [id, { ...e }])));
    setResult(null);
  };

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    setResult(null);
    try {
      const changes = dirty.map(id => {
        const edit = current.get(id)!;
        const orig = originalEdits.get(id)!;
        const fields: Record<string, unknown> = {};
        for (const k of Object.keys(PATCH_KEYS) as (keyof RowEdit)[]) {
          if (edit[k] !== orig[k]) fields[PATCH_KEYS[k]] = edit[k];
        }
        return { id, fields };
      });
      const res = await fetch('/api/admin/bulk-edit-pins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors?.[0] ?? data?.error ?? `save failed (${res.status})`);
      setResult({ updated: data.updated ?? 0 });
      for (const id of dirty) {
        const edit = current.get(id);
        if (edit) originalEdits.set(id, { ...edit });
      }
    } catch (e) {
      setResult({ updated: 0, errors: [e instanceof Error ? e.message : 'unknown'] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search hotel, city, country"
            className="text-small border border-sand rounded px-3 py-2 bg-white w-64"
          />
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
          <span className="text-label text-muted">
            {filtered.length} shown · {rows.length} hotels
          </span>
        </div>

        <div className="flex items-center gap-2">
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
            : `Updated ${result.updated} hotel${result.updated === 1 ? '' : 's'}.`}
        </div>
      )}

      <div className="border border-sand rounded overflow-x-auto">
        <table className="w-full text-small">
          <thead className="bg-cream-soft text-label uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left px-3 py-2 min-w-[220px]">Name</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">City</th>
              <th className="text-left px-3 py-2 w-[80px]">Year</th>
              <th className="text-left px-3 py-2 w-[80px]">Nights</th>
              <th className="text-left px-3 py-2 min-w-[160px]">Room type</th>
              <th className="text-left px-3 py-2 min-w-[160px]" title="Cash price per night">$/night</th>
              <th className="text-left px-3 py-2 min-w-[200px]" title="Points + program">Points</th>
              <th className="text-left px-3 py-2 w-[110px]">Rating</th>
              <th className="text-left px-3 py-2 w-[60px]" title="Has generated review">Rev</th>
              <th className="text-left px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted text-small">
                  No hotels match.
                </td>
              </tr>
            )}
            {filtered.map(row => {
              const edit = current.get(row.id) ?? rowToEdit(row);
              const orig = originalEdits.get(row.id);
              const isDirty = !!orig && !editsEqual(orig, edit);
              return (
                <tr
                  key={row.id}
                  className={
                    'border-t border-sand transition-colors ' +
                    (isDirty ? 'bg-teal/5' : 'hover:bg-cream-soft/40')
                  }
                >
                  <td className="px-3 py-2 align-top text-ink-deep">
                    <Link
                      href={`/admin/pins/${row.id}`}
                      className="font-medium hover:text-teal"
                    >
                      {row.name}
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
                  </td>
                  <td className="px-3 py-2 align-top text-slate hidden md:table-cell">
                    <div>{row.city || <span className="text-muted/60">—</span>}</div>
                    {row.country && (
                      <div className="text-label text-muted">{row.country}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="number"
                      min={1900}
                      max={2100}
                      step={1}
                      value={edit.visitYear ?? ''}
                      onChange={e => updateField(row.id, 'visitYear', e.target.value ? Number(e.target.value) : null)}
                      className="border border-sand rounded px-2 py-1 bg-white text-small w-20"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      value={edit.nightsStayed ?? ''}
                      onChange={e => updateField(row.id, 'nightsStayed', e.target.value ? Number(e.target.value) : null)}
                      className="border border-sand rounded px-2 py-1 bg-white text-small w-20"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="text"
                      value={edit.roomType ?? ''}
                      onChange={e => updateField(row.id, 'roomType', e.target.value || null)}
                      placeholder="Standard double"
                      className="border border-sand rounded px-2 py-1 bg-white text-small w-full"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={edit.roomPricePerNight ?? ''}
                        onChange={e => updateField(row.id, 'roomPricePerNight', e.target.value ? Number(e.target.value) : null)}
                        className="border border-sand rounded px-2 py-1 bg-white text-small w-24"
                      />
                      <input
                        type="text"
                        value={edit.roomPriceCurrency ?? ''}
                        onChange={e => updateField(row.id, 'roomPriceCurrency', e.target.value || null)}
                        placeholder="USD"
                        maxLength={4}
                        className="border border-sand rounded px-2 py-1 bg-white text-small font-mono w-16 uppercase"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={edit.pointsAmount ?? ''}
                        onChange={e => updateField(row.id, 'pointsAmount', e.target.value ? Number(e.target.value) : null)}
                        placeholder="40000"
                        className="border border-sand rounded px-2 py-1 bg-white text-small w-24"
                      />
                      <select
                        value={edit.pointsProgram ?? ''}
                        onChange={e => updateField(row.id, 'pointsProgram', e.target.value || null)}
                        className="border border-sand rounded px-1.5 py-1 bg-white text-small flex-1"
                      >
                        <option value="">—</option>
                        {POINTS_PROGRAMS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <RatingPicker
                      value={edit.personalRating}
                      onChange={v => updateField(row.id, 'personalRating', v)}
                      label={`Rating for ${row.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-center">
                    {row.hasReview ? (
                      <span className="text-teal" title="Has generated review">✓</span>
                    ) : (
                      <span className="text-muted/40" title="No review yet">—</span>
                    )}
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

function RatingPicker({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map(n => {
        const active = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            aria-label={`${n} of 5`}
            className={
              'w-5 h-5 leading-none text-base ' +
              (active ? 'text-amber-500' : 'text-muted/40 hover:text-amber-500/60')
            }
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
