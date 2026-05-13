import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

// Webhook endpoint to revalidate pages when Notion data changes.
// Configure a secret in env as REVALIDATE_SECRET.
// Usage: POST /api/revalidate?secret=xxx&path=/cities/vienna
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const path = searchParams.get('path') || '/';
  try {
    revalidatePath(path);
    // Cache tag inventory must match every tag actually emitted by lib/*
    // unstable_cache wrappers — otherwise a Notion-data webhook flushes
    // some surfaces but leaves others stale for up to 24h-7d. Run
    // `grep -rE "tags: \[" lib/*.ts` to keep this list in sync.
    revalidateTag('supabase-cities');
    revalidateTag('supabase-countries');
    revalidateTag('supabase-pins');
    revalidateTag('supabase-personal-photos');
    revalidateTag('notion-cities');
    revalidateTag('notion-countries');
    revalidateTag('notion-page-blocks');
    revalidateTag('place-cover');
    revalidateTag('place-content');
    revalidateTag('saved-lists-meta');
    revalidateTag('commons-attribution');
    revalidatePath('/pins');
    revalidatePath('/pins/cards');
    revalidatePath('/pins/map');
    return NextResponse.json({ ok: true, revalidated: path });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
