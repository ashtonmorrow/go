import { NextRequest, NextResponse } from 'next/server';

// === Middleware =============================================================
// Two responsibilities, gated by the matcher:
//   1. /admin/* + /api/admin/* — enforce HTTP basic auth from ADMIN_PASSWORD.
//   2. Everything else (via the catch-all matcher) — annotate the request
//      with an x-pathname header so server components can read the current
//      path without prop-drilling. The Sidebar uses this to skip heavy
//      data fetches on chrome-less routes (about, privacy, articles, posts,
//      admin) where the cockpit isn't shown.
//
// The catch-all matcher excludes static assets and Next internals so we
// don't pay the middleware cost on every chunk request.

export const config = {
  matcher: [
    // Run on every page request (server components see the header), but
    // skip Next's internal routes and static asset paths so we don't burn
    // CPU on chunk fetches.
    '/((?!_next/static|_next/image|favicon|robots.txt|sitemap.xml|llms.txt|images/|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|otf|css|js|map)).*)',
  ],
};

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdmin = path.startsWith('/admin') || path.startsWith('/api/admin');

  if (isAdmin) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return new NextResponse('Admin disabled — ADMIN_PASSWORD not set', {
        status: 503,
      });
    }

    const auth = req.headers.get('authorization');
    if (auth) {
      const [scheme, encoded] = auth.split(' ');
      if (scheme === 'Basic' && encoded) {
        try {
          const decoded = atob(encoded);
          const [, password] = decoded.split(':');
          if (password === expected) {
            return forwardWithPath(req, path);
          }
        } catch {
          // fall through to challenge
        }
      }
    }

    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
    });
  }

  // Non-admin routes — just stamp the pathname header.
  return forwardWithPath(req, path);
}

/** Pass the request through with x-pathname set so server components can
 *  read the current route without prop-drilling. Next.js doesn't expose
 *  pathname to server components directly; this header is the standard
 *  workaround. */
function forwardWithPath(req: NextRequest, path: string) {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', path);
  return NextResponse.next({ request: { headers } });
}
