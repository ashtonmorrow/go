import Link from 'next/link';
import type { ReactNode } from 'react';

// === EmptyState ============================================================
// Shared shell for visitor-facing empty / zero-result states. The UX
// review (May 2026) flagged every "No X yet." paragraph as a missed
// next-best-action moment: a curious visitor who just hit zero results
// is the most likely person on the page to bounce, so the empty state
// is real estate worth styling.
//
// Pattern: large soft icon (emoji works well in the brand voice) → a
// short title in Mike's voice → one supporting sentence → up to three
// suggested next clicks rendered as pill links. The pill links lift the
// page from "dead end" to "you'd probably also like these."
//
// Three layouts:
//   - card    (default): rounded card with sand border, cream-soft fill
//   - inline:           : light variant, no border, used inside flowing copy
//   - hero    : tall variant for full-page no-content states

type Suggestion = {
  href: string;
  label: string;
};

type Props = {
  /** Decorative — usually an emoji. Falls back to a 🗺️. */
  icon?: ReactNode;
  /** Short headline, e.g. "Nothing on this list yet." */
  title: string;
  /** Supporting prose. Can include JSX (a link, a strong, etc.) for
   *  cases where the next-action belongs inline rather than as a pill. */
  body?: ReactNode;
  /** Up to ~3 suggested next-click pills. */
  suggestions?: Suggestion[];
  variant?: 'card' | 'inline' | 'hero';
};

export default function EmptyState({
  icon = '🗺️',
  title,
  body,
  suggestions = [],
  variant = 'card',
}: Props) {
  const container =
    variant === 'card'
      ? 'card p-8 sm:p-10 text-center bg-cream-soft/60 border border-sand'
      : variant === 'hero'
      ? 'p-10 sm:p-14 text-center'
      : 'py-6 text-center text-slate';

  return (
    <div className={container} role="status">
      <div aria-hidden className="text-h1 leading-none mb-3 opacity-70">
        {icon}
      </div>
      <h3 className="text-h3 text-ink-deep leading-tight">{title}</h3>
      {body && (
        <p className="mt-2 text-prose text-slate leading-snug max-w-prose mx-auto">
          {body}
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 justify-center">
          {suggestions.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="
                inline-flex items-center gap-1.5
                rounded-full border border-sand
                bg-white px-4 py-2
                text-small font-medium text-ink-deep
                shadow-sm
                hover:bg-cream-soft hover:border-teal hover:text-teal
                transition-colors
              "
            >
              <span>{s.label}</span>
              <span aria-hidden className="text-muted">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
