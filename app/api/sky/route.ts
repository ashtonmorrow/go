// === /api/sky — OpenSky proxy ==============================================
// Server-side proxy for live aircraft data from the OpenSky Network.
// Browsers fetch /api/sky?lat=X&lng=Y instead of hitting OpenSky directly,
// which sidesteps any CORS quirks and lets us add OpenSky credentials
// in one place without exposing them to the client.
//
// Auth preference (first match wins):
//   1. OAuth2 Client Credentials — OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET
//      (this is what new OpenSky accounts get; the access token is fetched
//      once per ~25 min and cached by Next's fetch layer)
//   2. Basic Auth — OPENSKY_USERNAME + OPENSKY_PASSWORD (legacy accounts)
//   3. Anonymous — no credentials. 100 credits/day per server IP cap.
//
// Caching: `next: { revalidate: 60 }` on the upstream /states/all fetch
// deduplicates calls per coordinate per minute regardless of how many
// browsers are watching the same city.
//
import { NextResponse } from 'next/server';
import { boundingBoxAround, parseOpenSkyResponse } from '@/lib/skyTraffic';

const OPENSKY_API = 'https://opensky-network.org/api/states/all';
const OPENSKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const RADIUS_KM = 50;

const CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;
const USERNAME = process.env.OPENSKY_USERNAME;
const PASSWORD = process.env.OPENSKY_PASSWORD;

/**
 * Exchange the OAuth2 client credentials for a short-lived access token.
 * The fetch is cached by Next.js for 25 minutes, which is slightly less
 * than OpenSky's 30-minute token TTL.
 */
async function fetchAccessToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  try {
    const res = await fetch(OPENSKY_TOKEN_URL, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      next: { revalidate: 60 * 25 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid_coords' }, { status: 400 });
  }

  const bbox = boundingBoxAround(lat, lng, RADIUS_KM);
  const url =
    `${OPENSKY_API}?` +
    `lamin=${bbox.lamin.toFixed(4)}` +
    `&lomin=${bbox.lomin.toFixed(4)}` +
    `&lamax=${bbox.lamax.toFixed(4)}` +
    `&lomax=${bbox.lomax.toFixed(4)}`;

  const headers: Record<string, string> = {
    'User-Agent': 'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
  };
  if (CLIENT_ID && CLIENT_SECRET) {
    const token = await fetchAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (USERNAME && PASSWORD) {
    const creds = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    headers.Authorization = `Basic ${creds}`;
  }

  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: res.status === 429 ? 'rate_limit' : 'upstream',
          status: res.status,
        },
        { status: res.status === 429 ? 429 : 502 },
      );
    }
    const data = (await res.json()) as unknown;
    const parsed = parseOpenSkyResponse(data);
    if (!parsed) {
      return NextResponse.json({ error: 'parse' }, { status: 502 });
    }
    return NextResponse.json(parsed, {
      headers: {
        // Let the browser cache for 30 s, edge cache for 60 s.
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 502 });
  }
}
