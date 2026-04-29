import { NextResponse } from 'next/server';
import { findCandidatesForPhotos } from '@/lib/findOrCreatePin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const photos = Array.isArray(body?.photos) ? body.photos : null;
  if (!photos) {
    return NextResponse.json({ error: 'photos[] required' }, { status: 400 });
  }
  const valid = photos.filter(
    (p: any) =>
      p &&
      typeof p.hash === 'string' &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number',
  );
  if (valid.length === 0) {
    return NextResponse.json({ candidates: [] });
  }
  try {
    const candidates = await findCandidatesForPhotos(valid);
    return NextResponse.json({ candidates });
  } catch (e) {
    console.error('[find-candidates] error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
