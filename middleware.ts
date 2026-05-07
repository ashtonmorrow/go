import { NextRequest, NextResponse } from 'next/server';

// === Middleware =============================================================
// HTTP basic auth on /admin/* + /api/admin/* using ADMIN_PASSWORD. Other
// routes don't need middleware; the matcher restricts execution so edge
// CPU isn't spent on every page navigation.
//
// History: middleware previously stamped an x-pathname request header on
// every route so the server-side Sidebar could read the current path via
// headers(). That made the entire layout force-dynamic and broke ISR for
// every page on the site. The Sidebar now fetches its corpora through
// unstable_cache without route awareness, so the header is gone.

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export function middleware(req: NextRequest) {
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
          return NextResponse.next();
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
