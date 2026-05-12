// === /api/sky — OpenSky proxy ==============================================
// Server-side proxy for live aircraft data from the OpenSky Network.
// Browsers fetch /api/sky?lat=X&lng=Y instead of hitting OpenSky directly,
// which sidesteps any CORS quirks and lets us add OPENSKY_USERNAME +
// OPENSKY_PASSWORD in one place when the anonymous quota becomes a
// constraint.
//
// Caching is handled by Next.js: `revalidate: 60` deduplicates upstream
// calls per coordinate per minute, regardless of how many visitors are
// watching the same city.
//
// Anonymous OpenSky quota: 100 credits/day per server IP (each bounded
// query costs 1 credit). With Basic Auth credentials, the limit is
// 4,000/day.
//
import { NextResponse } from 'next/server';
import { boundingBoxAround, parseOpenSkyResponse } from '@/lib/skyTraffic';

const OPENSKY_API = 'https://opensky-network.org/api/states/all';
const RADIUS_KM = 50;

const USERNAME = process.env.OPENSKY_USERNAME;
const PASSWORD = process.env.OPENSKY_PASSWORD;

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
  if (USERNAME && PASSWORD) {
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
