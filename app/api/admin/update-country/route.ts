import { NextResponse } from 'next/server';
import { updateGoCountry } from '@/lib/goAugmentation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const idOrSlug = typeof body?.id === 'string' && body.id
    ? body.id
    : typeof body?.slug === 'string'
    ? body.slug
    : '';

  if (!idOrSlug) {
    return NextResponse.json({ error: 'id or slug required' }, { status: 400 });
  }

  try {
    const data = await updateGoCountry(idOrSlug, body?.fields);
    if (!data) return NextResponse.json({ error: 'country not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'country update failed';
    console.error('[update-country] failed:', e);
    const status =
      message.includes('fields') ||
      message.includes('recognised') ||
      message.includes('Wikimedia Commons')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

