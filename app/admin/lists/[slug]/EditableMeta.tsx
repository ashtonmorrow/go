'use client';

import { useEffect, useRef, useState } from 'react';

// === EditableMeta ===========================================================
// Inline-editable header for /admin/lists/[slug]: the H1 (list name) and a
// description block. Both autosave on blur via /api/admin/saved-list.
//
// Title editing is gated behind a "Rename" button rather than always-on
// click-to-edit because rename triggers a slug change — the URL flips,
// which would break any sibling tabs the admin has open. Confirmation
// modal makes the cost obvious.
//
// Description is always inline (no rename side effect). Empty description
// renders a muted "Add a description…" placeholder that opens the editor
// on click.
//
// Both fields commit optimistically; on error we surface a flash and
// revert to the last server-confirmed value.

type Props = {
  initialName: string;
  initialDescription: string | null;
  /** When the title is renamed we navigate to the new slug. Caller can
   *  pass a router.push callback or, more typically, just window.location
   *  swap. */
  onRenamed?: (newName: string, newSlug: string) => void;
};

export default function EditableMeta({
  initialName,
  initialDescription,
  onRenamed,
}: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftName, setDraftName] = useState(initialName);
  const [draftDesc, setDraftDesc] = useState(initialDescription ?? '');
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the inputs when the user opens them.
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingDesc) {
      descTextareaRef.current?.focus();
      // Place cursor at end so the user can keep typing.
      const len = descTextareaRef.current?.value.length ?? 0;
      descTextareaRef.current?.setSelectionRange(len, len);
    }
  }, [editingDesc]);

  async function commitTitle() {
    const next = draftName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!next || next === name) {
      setEditingTitle(false);
      setDraftName(name);
      return;
    }
    if (
      !window.confirm(
        `Rename "${name}" → "${next}"?\n\n` +
        `This rewrites every pin's saved_lists membership and changes the URL of this admin page + the public list page. ` +
        `Open tabs pointing at the old slug will 404 until reloaded.`,
      )
    ) {
      setEditingTitle(false);
      setDraftName(name);
      return;
    }
    setSavingTitle(true);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/saved-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rename', from: name, to: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'rename failed');
      setName(next);
      setDraftName(next);
      setEditingTitle(false);
      // Slug derives from the name. The page route uses the same
      // listNameToSlug helper, so we mirror it here. URL update without
      // a router import — keeps the component dependency-light.
      const newSlug = next.replace(/\s+/g, '-');
      if (onRenamed) onRenamed(next, newSlug);
      else window.location.assign(`/admin/lists/${newSlug}`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'rename failed');
      setDraftName(name);
      setEditingTitle(false);
    } finally {
      setSavingTitle(false);
    }
  }

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
          inline text input that commits on blur or Enter. */}
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
            title="Rename this list (changes the URL)"
          >
            Rename…
          </button>
        )}
        {savingTitle && <span className="text-label text-muted">saving…</span>}
      </div>

      {/* Description — always inline-editable. Click to edit; blur commits. */}
      <div className="mt-2 max-w-prose">
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
