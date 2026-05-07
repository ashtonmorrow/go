import Link from 'next/link';

export type RelatedItem = {
  href: string;
  label: string;
  /** Short emoji glyph for visual rhythm. Optional. */
  emoji?: string;
};

// Cross-link strip rendered at the bottom of a list page. Surfaces the
// anchor city / country detail pages plus any posts that mention this
// list (frontmatter `links.lists` reverse lookup). Helps both readers
// (next obvious step) and crawlers (more internal edges into the place
// graph).
export default function RelatedStrip({ items }: { items: RelatedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12 pt-8 border-t border-sand">
      <h2 className="text-h2 text-ink-deep mb-1">Keep reading</h2>
      <p className="text-prose text-muted mb-4">
        Companion pages on places and themes that overlap with this list.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {items.map(item => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="card block p-4 hover:bg-cream-soft transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-prose text-ink-deep">
                {item.emoji && <span aria-hidden>{item.emoji}</span>}
                <span>{item.label}</span>
                <span aria-hidden className="text-muted">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
