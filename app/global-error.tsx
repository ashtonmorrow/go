'use client';

// App Router GLOBAL error boundary. Lower-priority than per-route
// error.tsx but catches anything that escapes them — including throws
// in app/layout.tsx (the root server component), which a route-segment
// error.tsx can't see. Without this file, those errors fall through to
// the pages-router default 500.html, which is what we've been getting
// on /pins/[slug] and /cities/[slug] in production.
//
// Replaces the entire <html>/<body> tree (it has to — when the root
// layout itself failed, we can't trust any of its DOM is mountable),
// so the markup here is intentionally self-contained: no imports of
// our shared chrome, no Tailwind utility classes, just inline styles.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel runtime logs surface anything written to console.error.
    // This is currently the only way we get the actual stack out of
    // the bare-500 case; the digest ties the user's report back to a
    // specific log line.
    console.error('[global-error]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: '#1d1d1f',
          background: '#fbfaf6',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              margin: '0 0 12px',
            }}
          >
            Something broke loading this page
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: '#5f5f5f', margin: 0 }}>
            The atlas is still here. Try again, or head back to the
            map.
          </p>
          <div
            style={{
              marginTop: 24,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                border: 'none',
                background: '#1d1d1f',
                color: '#fbfaf6',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                border: '1px solid #d8d4c5',
                background: 'transparent',
                color: '#1d1d1f',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Home
            </a>
          </div>
          {error.digest && (
            <p
              style={{
                marginTop: 24,
                fontSize: 11,
                color: '#8a8a8a',
                fontFamily:
                  'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
