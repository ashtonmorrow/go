'use client';

import { useMemo, useState } from 'react';

type ListRow = { name: string; count: number };

export default function ListsAdminClient({ initialLists }: { initialLists: ListRow[] }) {
  const [lists, setLists] = useState(initialLists);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(l => l.name.includes(q));
  }, [lists, query]);

  async function rename(from: string) {
    const to = editValue.trim().toLowerCase();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rename', from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'rename failed');
      // Reflect locally without a full refresh: collapse the renamed entry
      // into its target if the target already exists, otherwise just rename.
      setLists(prev => {
        const fromRow = prev.find(l => l.name === from);
        if (!fromRow) return prev;
        const existing = prev.find(l => l.name === to);
        let next = prev.filter(l => l.name !== from);
        if (existing) {
          next = next.map(l =>
            l.name === to ? { ...l, count: l.count + fromRow.count } : l,
          );
        } else {
          next.push({ name: to, count: fromRow.count });
        }
        return next.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      });
      setFlash(`Renamed "${from}" → "${to}" (${data.updated} pins).`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'rename failed');
    } finally {
      setBusy(false);
      setEditing(null);
    }
  }

  async function remove(name: string) {
    const ok = confirm(`Remove "${name}" from every pin that carries it? Pins will not be deleted.`);
    if (!ok) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'delete failed');
      setLists(prev => prev.filter(l => l.name !== name));
      setFlash(`Deleted "${name}" (${data.updated} pins updated).`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter lists by name…"
          className="flex-1 max-w-md text-small border border-sand rounded px-3 py-2 bg-white focus:outline-none focus:border-ink-deep"
        />
        <span className="text-label text-muted tabular-nums">
          {filtered.length} / {lists.length}
        </span>
      </div>

      {flash && (
        <div className="mb-4 px-3 py-2 rounded bg-cream-soft border border-sand text-small text-ink">
          {flash}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-small">
          <thead className="bg-cream-soft border-b border-sand">
            <tr>
              <th className="text-left px-4 py-2 text-label uppercase tracking-[0.1em] text-slate font-medium">
                Name
              </th>
              <th className="text-right px-4 py-2 text-label uppercase tracking-[0.1em] text-slate font-medium w-24">
                Pins
              </th>
              <th className="text-right px-4 py-2 text-label uppercase tracking-[0.1em] text-slate font-medium w-48">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.name} className="border-b border-sand/60 last:border-0 hover:bg-cream-soft/50">
                <td className="px-4 py-2.5 align-middle">
                  {editing === l.name ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') rename(l.name);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        autoFocus
                        className="flex-1 text-small border border-ink-deep rounded px-2 py-1 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => rename(l.name)}
                        disabled={busy}
                        className="px-2 py-1 rounded bg-teal text-white text-label font-medium disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="px-2 py-1 rounded text-ink text-label hover:text-ink-deep"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="text-ink-deep capitalize">{l.name}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate align-middle">
                  {l.count}
                </td>
                <td className="px-4 py-2.5 text-right align-middle">
                  {editing !== l.name && (
                    <span className="inline-flex gap-2">
                      <a
                        href={`/lists/${encodeURIComponent(l.name.replace(/\s+/g, '-'))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-label text-teal hover:underline"
                      >
                        View ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(l.name);
                          setEditValue(l.name);
                        }}
                        disabled={busy}
                        className="text-label text-slate hover:text-ink-deep disabled:opacity-50"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(l.name)}
                        disabled={busy}
                        className="text-label text-orange hover:text-orange/80 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
