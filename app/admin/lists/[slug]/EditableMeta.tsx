'use client';

import { useEffect, useRef, useState } from 'react';

// === EditableMeta ===========================================================
// Inline-editable header for /admin/lists/[slug]: the H1 (list name), the
// URL slug, and a description block. All three autosave on blur via
// /api/admin/saved-list.
//
// Name vs slug split (May 2026): saved_lists.slug is now a real column,
// editable independently of name. Renaming a list no longer flips the
// URL or kicks the admin to a different page mid-edit. The slug field
// is a separate editor that does redirect (since the route still keys
// on slug) but only when the slug itself changes.
//
//   * Name field      → rename action. Still rewrites every pin's
//                       saved_lists[] membership and updates saved_lists.name,
//                       which can be expensive for large lists. URL stays
//                       put. No redirect.
//   * Slug field      → updateMeta action with `slug`. Validates against
//                       the lowercase-letters-digits-dashes pattern,
//                       catches uniqueness collisions, redirects the
//                       admin to /admin/lists/<new-slug> on success.
//   * Description     → updateMeta action with `description`. Inline,
//                       no confirmations.
//
// Commits are optimistic; on error we flash a message and revert to
// the last server-confirmed value.

type Props = {
  initialName: string;
  initialSlug: string;
  initialDescription: string | null;
  /** Called when the slug commits successfully. Caller usually does a
   *  window.location swap to the new admin URL. */
  onSlugChanged?: (newSlug: string) => void;
};

export default function EditableMeta({
  initialName,
  initialSlug,
  initialDescription,
  onSlugChanged,
}: Props) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [description, setDescription] = useState(initialDescription ?? '');

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  const [draftName, setDraftName] = useState(initialName);
  const [draftSlug, setDraftSlug] = useState(initialSlug);
  const [draftDesc, setDraftDesc] = useState(initialDescription ?? '');

  const [savingTitle, setSavingTitle] = useState(false);
  const [savingSlug, setSavingSlug] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const slugInputRef = useRef<HTMLInputElement | null>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the inputs when the user opens them.
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingSlug) slugInputRef.current?.focus();
  }, [editingSlug]);
  useEffect(() => {
    if (editingDesc) {
      descTextareaRef.current?.focus();
      // Place cursor at end so the user can keep typing.
      const len = descTextareaRef.current?.value.length ?? 0;
      descTextareaRef.current?.setSelectionRange(len, len);
    }
  }, [editingDesc]);

  // === Name ================================================================
  // Rename via the `rename` action. Rewrites every pin's saved_lists[]
  // entry from `name` → next, and updates the saved_lists meta row. The
  // URL stays put since the slug column is independent.
  async function commitTitle() {
    const next = draftName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!next || next === name) {
      setEditingTitle(false);
      setDraftName(name);
      return;
    }
    setSavingTitle(true);
    setFlash(null);
    const previous = name;
    setName(next);
    setEditingTitle(false);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rename', from: previous, to: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'rename failed');
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'rename failed');
      setName(previous);
      setDraftName(previous);
    } finally {
      setSavingTitle(false);
    }
  }

  // === Slug ================================================================
  // Update via `updateMeta { slug }`. Validates client-side first to
  // surface the rule before the round-trip. On success, navigate to the
  // new admin URL so the route segment matches the new identifier.
  async function commitSlug() {
    const next = draftSlug.trim().toLowerCase();
    if (!next || next === slug) {
      setEditingSlug(false);
      setDraftSlug(slug);
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) {
      setFlash(
        'Slug must be lowercase letters, digits, and dashes (no spaces, no leading/trailing dash, no consecutive dashes).',
      );
      setDraftSlug(slug);
      setEditingSlug(false);
      return;
    }
    if (
      !window.confirm(
        `Change URL slug "${slug}" → "${next}"?\n\n` +
        `The public page moves to /lists/${next} and the admin moves to /admin/lists/${next}. ` +
        `Any links pointing at the old slug will 404 (no redirect is written).`,
      )
    ) {
      setEditingSlug(false);
      setDraftSlug(slug);
      return;
    }
    setSavingSlug(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'updateMeta', name, slug: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'slug update failed');
      setSlug(next);
      setDraftSlug(next);
      setEditingSlug(false);
      if (onSlugChanged) onSlugChanged(next);
      else window.location.assign(`/admin/lists/${next}`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'slug update failed');
      setDraftSlug(slug);
      setEditingSlug(false);
    } finally {
      setSavingSlug(false);
    }
  }

  // === Description =========================================================
  async function commitDesc() {
    const next = draftDesc.trim();
    if (next === (description ?? '').trim()) {
      setEditingDesc(false);
      return;
    }
    setSavingDesc(true);
    setFlash(null);
    // Optimistic local commit.
    const previous = description;
    setDescription(next);
    setEditingDesc(false);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMeta',
          name,
          description: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'save failed');
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'save failed');
      setDescription(previous);
      setDraftDesc(previous ?? '');
    } finally {
      setSavingDesc(false);
    }
  }

  return (
    <div>
      {/* Title row — display H1 plus a "Rename…" button. Click opens an
          inline text input that commits on blur or Enter. The URL stays
          put on commit since the slug is now its own column. */}
      <div className="flex items-baseline gap-3 flex-wrap">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={draftName}
            disabled={savingTitle}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setDraftName(name);
                setEditingTitle(false);
              }
            }}
            className="text-h1 text-ink-deep leading-tight bg-cream-soft border-b-2 border-teal px-1 -mx-1 outline-none"
            spellCheck={false}
            autoCapitalize="off"
          />
        ) : (
          <h1 className="text-h1 text-ink-deep leading-tight capitalize">
            {name}
          </h1>
        )}
        {!editingTitle && (
          <button
            type="button"
            onClick={() => {
              setDraftName(name);
              setEditingTitle(true);
            }}
            className="text-label text-slate hover:text-ink-deep underline-offset-2 hover:underline"
            title="Rename this list (URL stays the same)"
          >
            Rename…
          </button>
        )}
        {savingTitle && <span className="text-label text-muted">saving…</span>}
      </div>

      {/* Slug row — separate editor under the name. Sits as small, muted
          text so it reads as metadata rather than competing with the H1.
          Renames here flip the URL; the confirm modal makes the cost
          obvious before the redirect. */}
      <div className="mt-2 flex items-baseline gap-2 flex-wrap text-label">
        <span className="text-muted">URL:</span>
        {editingSlug ? (
          <input
            ref={slugInputRef}
            value={draftSlug}
            disabled={savingSlug}
            onChange={e => setDraftSlug(e.target.value)}
            onBlur={commitSlug}
            onKeyDown={e => {
              if (e.key === 'Enter') commitSlug();
              if (e.key === 'Escape') {
                setDraftSlug(slug);
                setEditingSlug(false);
              }
            }}
            className="font-mono text-small text-ink-deep bg-cream-soft border-b border-teal px-1 -mx-1 outline-none w-auto min-w-[12ch]"
            spellCheck={false}
            autoCapitalize="off"
          />
        ) : (
          <code className="font-mono text-small text-slate">/lists/{slug}</code>
        )}
        {!editingSlug && (
          <button
            type="button"
            onClick={() => {
              setDraftSlug(slug);
              setEditingSlug(true);
            }}
            className="text-label text-slate hover:text-ink-deep underline-offset-2 hover:underline"
            title="Change the URL slug for this list (will redirect)"
          >
            Change slug…
          </button>
        )}
        {savingSlug && <span className="text-label text-muted">saving…</span>}
      </div>

      {/* Description — always inline-editable. Click to edit; blur commits. */}
      <div className="mt-3 max-w-prose">
        {editingDesc ? (
          <textarea
            ref={descTextareaRef}
            value={draftDesc}
            disabled={savingDesc}
            onChange={e => setDraftDesc(e.target.value)}
            onBlur={commitDesc}
            onKeyDown={e => {
              // Cmd/Ctrl+Enter commits; Escape reverts.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commitDesc();
              if (e.key === 'Escape') {
                setDraftDesc(description ?? '');
                setEditingDesc(false);
              }
            }}
            placeholder="Description shown on the public list page and in card hover tips."
            rows={3}
            className="w-full text-prose text-slate bg-white border border-sand rounded-md px-3 py-2 outline-none focus:border-ink-deep focus:ring-2 focus:ring-ink-deep/10 resize-y"
          />
        ) : description ? (
          <button
            type="button"
            onClick={() => {
              setDraftDesc(description);
              setEditingDesc(true);
            }}
            className="block text-left text-prose text-slate hover:text-ink-deep w-full"
            title="Click to edit the list description"
          >
            {description}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftDesc('');
              setEditingDesc(true);
            }}
            className="text-prose text-muted/80 italic hover:text-slate"
          >
            Add a description…
          </button>
        )}
        {savingDesc && (
          <span className="text-label text-muted block mt-1">saving…</span>
        )}
      </div>

      {flash && (
        <div className="mt-3 px-3 py-2 rounded bg-orange/10 border border-orange/40 text-small text-orange">
          {flash}
        </div>
      )}
    </div>
  );
}
