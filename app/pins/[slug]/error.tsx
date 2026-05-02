'use client';

// Route-level error boundary. Catches any uncaught render error inside
// /pins/[slug] (server or client) and renders a friendly fallback instead
// of Next's blank 500. The actual error is logged to the Vercel function
// log via console.error in useEffect — handy when an underlying upstream
// (Supabase, Wikipedia, Vercel data cache) returns something the page
// can't handle. Pages router's _error then never sees this case.
//
// We don't surface the raw error to the user — keep the chrome calm and
// the message generic. The "Try again" button calls Next's reset() which
// re-runs the server component for the same URL.

import { useEffect } from 'react';
import Link from 'next/link';

export default function PinError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel runtime logs surface anything written to console.error, so
    // this is how we get the stack out of an opaque "Internal Server
    // Error" into something we can debug.
    console.error('[pins/[slug] error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <article className="max-w-prose mx-auto px-5 py-24 text-center">
      <h1 className="text-h1 text-ink-deep">Couldn&rsquo;t load this pin</h1>
      <p className="mt-4 text-slate">
        Something on the way to this page broke. The atlas is still here —
        try again, or head back to the index.
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
          href="/pins/cards"
          className="px-4 py-2 rounded border border-sand text-ink-deep hover:bg-cream-soft transition-colors"
        >
          All pins
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
