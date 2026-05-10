'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// === SearchModal ===========================================================
// Site-wide ⌘K / Ctrl-K search overlay. Press the shortcut from any page
// (or click the rail's Search button) and a modal slides up with an
// input and a filtered list of suggestions.
//
// Suggestions are pre-loaded server-side and filtered client-side as the
// user types — instant for the common "I want the Cape Town guide"
// case. Hitting Enter without selecting a suggestion submits the query
// to /search for the full server-side hit list (posts, cities, lists,
// pins). Keyboard model: ↑/↓ navigate, Enter selects, Esc closes.
//
// Renders nothing at all until the user opens it; the suggestions list
// is an in-memory array, no network on each keystroke.

export type SearchItem = {
  /** Stable React key + dedupe identity. */
  key: string;
  href: string;
  title: string;
  /** Optional sub-line under the title — usually a short description
   *  or a kind label like "Guide" / "Article". */
  subtitle: string | null;
  /** Kind chip in the result row. */
  kind: 'guide' | 'article' | 'page';
};

type Props = {
  /** Pre-loaded suggestion list. The modal filters this client-side
   *  by title + subtitle on each keystroke. Caller pre-builds the
   *  union of guides, articles, and top-level pages. */
  items: SearchItem[];
};

const KIND_LABEL: Record<SearchItem['kind'], string> = {
  guide: 'Guide',
  article: 'Article',
  page: 'Page',
};

export default function SearchModal({ items }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Filter the item list by lowercased substring match on title +
  // subtitle. When the input is empty, show everything (capped) so
  // the modal opens with a useful "what's in here" snapshot rather
  // than an empty state.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items
      .filter(it =>
        it.title.toLowerCase().includes(q) ||
        it.subtitle?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, query]);

  // Keyboard shortcut to open: ⌘K on macOS, Ctrl+K elsewhere. Mounted
  // on document so any page can fire it. Also listens for / when the
  // user is not in a text field (a common "press / to search" pattern).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === '/' && !isMod) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const editable =
          tag === 'input' || tag === 'textarea' || target?.isContentEditable;
        if (!editable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Esc + arrow-key + Enter handling while the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[highlighted];
        if (target) {
          setOpen(false);
          router.push(target.href);
        } else if (query.trim()) {
          setOpen(false);
          router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, filtered, highlighted, query, router]);

  // Focus the input + reset state when the modal opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlighted(0);
    // setTimeout 0 to let React mount the input before focus.
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  // Reset highlight when the filter changes so the cursor lands on the
  // top result rather than at the same numeric position.
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Trigger button — small "Search" pill that goes in the
          sidebar. Click toggles the modal; the keyboard shortcut hint
          is only shown on devices wide enough to suggest a real
          keyboard. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          inline-flex items-center gap-2
          px-2.5 py-1.5 rounded-md
          border border-sand bg-cream-soft
          text-small text-muted
          hover:border-slate hover:text-ink-deep transition-colors
          w-full justify-between
        "
        aria-label="Open search (Command-K)"
      >
        <span className="inline-flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-micro text-muted bg-white border border-sand rounded px-1 py-0.5 leading-none tabular-nums">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search the atlas"
          className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center p-4 sm:pt-24"
          onClick={close}
        >
          <div
            className="w-full max-w-xl bg-white rounded-lg shadow-paper overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-sand">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-muted">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search guides, articles, pages…"
                className="flex-1 bg-transparent outline-none text-ink-deep placeholder:text-muted"
              />
              <button
                type="button"
                onClick={close}
                className="text-label text-muted hover:text-ink-deep"
                aria-label="Close search"
              >
                Esc
              </button>
            </div>

            {filtered.length > 0 ? (
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {filtered.map((item, i) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={close}
                      onMouseEnter={() => setHighlighted(i)}
                      className={
                        'flex items-center gap-3 px-4 py-2.5 text-small ' +
                        (i === highlighted
                          ? 'bg-cream-soft text-ink-deep'
                          : 'text-ink hover:bg-cream-soft')
                      }
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="block text-label text-muted truncate">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      <span className="pill bg-cream-soft border border-sand text-micro text-muted uppercase tracking-wider flex-shrink-0">
                        {KIND_LABEL[item.kind]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center text-small text-muted">
                {query.trim()
                  ? 'No quick matches. Press Enter for a full search.'
                  : 'Start typing to search.'}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-sand bg-cream-soft text-micro text-muted flex items-center justify-between gap-3 flex-wrap">
              <span>
                <kbd className="text-micro bg-white border border-sand rounded px-1 py-0.5">↑↓</kbd>{' '}
                navigate ·{' '}
                <kbd className="text-micro bg-white border border-sand rounded px-1 py-0.5">↵</kbd>{' '}
                open ·{' '}
                <kbd className="text-micro bg-white border border-sand rounded px-1 py-0.5">Esc</kbd>{' '}
                close
              </span>
              {query.trim() && (
                <Link
                  href={`/search?q=${encodeURIComponent(query.trim())}`}
                  onClick={close}
                  className="text-teal hover:underline"
                >
                  Search everything for &ldquo;{query.trim()}&rdquo; →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
