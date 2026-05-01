'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { listNameToSlug } from '@/lib/savedLists';

type ListRow = {
  name: string;
  count: number;
  googleShareUrl: string | null;
  description: string | null;
};

type EditTarget = { name: string; field: 'name' | 'url' };

export default function ListsAdminClient({ initialLists }: { initialLists: ListRow[] }) {
  const [lists, setLists] = useState(initialLists);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Create-new-list state — separate from `editing` so the user can be
  // composing a new list name and editing an inline cell at the same
  // time without one stomping on the other.
  const [newName, setNewName] = useState('');

  async function createList() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name) return;
    if (lists.some(l => l.name === name)) {
      setFlash(`"${name}" already exists.`);
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'create failed');
      setLists(prev =>
        [...prev, { name, count: 0, googleShareUrl: null, description: null }].sort(
          (a, b) => b.count - a.count || a.name.localeCompare(b.name),
        ),
      );
      setNewName('');
      setFlash(`Created "${name}". Click it to add pins.`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'create failed');
    } finally {
      setBusy(false);
    }
  }

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
      setLists(prev => {
        const fromRow = prev.find(l => l.name === from);
        if (!fromRow) return prev;
        const existing = prev.find(l => l.name === to);
        let next = prev.filter(l => l.name !== from);
        if (existing) {
          next = next.map(l =>
            l.name === to
              ? {
                  ...l,
                  count: l.count + fromRow.count,
                  // Don't clobber a destination URL with the source's URL.
                  googleShareUrl: l.googleShareUrl ?? fromRow.googleShareUrl,
                  description: l.description ?? fromRow.description,
                }
              : l,
          );
        } else {
          next.push({ ...fromRow, name: to });
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

  async function saveUrl(name: string) {
    const url = editValue.trim();
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMeta',
          name,
          google_share_url: url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save failed');
      setLists(prev => prev.map(l =>
        l.name === name ? { ...l, googleShareUrl: url || null } : l,
      ));
      setFlash(url ? `Saved Google URL for "${name}".` : `Cleared URL for "${name}".`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'save failed');
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
              <th className="text-left px-4 py-2 text-label uppercase tracking-[0.1em] text-slate font-medium">
                Google URL
              </th>
              <th className="text-right px-4 py-2 text-label uppercase tracking-[0.1em] text-slate font-medium w-20">
                Pins
              </th>
              <th className="text-right px-4 py-2 text-label uppercase tracking-[0.1em] text-slate font-medium w-48">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => {
              const editingName = editing?.name === l.name && editing.field === 'name';
              const editingUrl = editing?.name === l.name && editing.field === 'url';
              return (
                <tr key={l.name} className="border-b border-sand/60 last:border-0 hover:bg-cream-soft/50">
                  <td className="px-4 py-2.5 align-middle">
                    {editingName ? (
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
                  <td className="px-4 py-2.5 align-middle min-w-[220px] max-w-[360px]">
                    {editingUrl ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveUrl(l.name);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          autoFocus
                          placeholder="https://maps.app.goo.gl/…"
                          className="flex-1 text-small border border-ink-deep rounded px-2 py-1 bg-white font-mono text-micro"
                        />
                        <button
                          type="button"
                          onClick={() => saveUrl(l.name)}
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
                    ) : l.googleShareUrl ? (
                      <a
                        href={l.googleShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-micro text-accent hover:underline truncate inline-block max-w-full align-middle"
                        title={l.googleShareUrl}
                      >
                        {l.googleShareUrl.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="text-muted text-label italic">no URL set</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate align-middle">
                    {l.count}
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle">
                    {!editing && (
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
                            setEditing({ name: l.name, field: 'url' });
                            setEditValue(l.googleShareUrl ?? '');
                          }}
                          disabled={busy}
                          className="text-label text-slate hover:text-ink-deep disabled:opacity-50"
                          title={l.googleShareUrl ? 'Edit URL' : 'Set URL'}
                        >
                          {l.googleShareUrl ? 'Edit URL' : 'Set URL'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing({ name: l.name, field: 'name' });
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
