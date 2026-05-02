'use client';

// Route-level error boundary for /cities/[slug] — same pattern as the
// /pins/[slug] one. Catches anything the page throws (Supabase, climate
// fetch, cover lookup, JSON-LD assembly) and renders a calm fallback
// instead of the bare Vercel 500. The actual error gets logged to
// Vercel runtime logs via console.error.

import { useEffect } from 'react';
import Link from 'next/link';

export default function CityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[cities/[slug] error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <article className="max-w-prose mx-auto px-5 py-24 text-center">
      <h1 className="text-h1 text-ink-deep">Couldn&rsquo;t load this city</h1>
      <p className="mt-4 text-slate">
        Something on the way to this page broke. Try again, or head back
        to the index.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 rounded bg-ink-deep text-cream-soft hover:bg-ink transition-colors"
        >
          Try again
        </button>
        <Link
          href="/cities/cards"
          className="px-4 py-2 rounded border border-sand text-ink-deep hover:bg-cream-soft transition-colors"
        >
          All cities
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-micro text-muted font-mono">
          Reference: {error.digest}
        </p>
      )}
    </article>
  );
}
