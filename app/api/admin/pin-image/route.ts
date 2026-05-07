import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// === DELETE /api/admin/pin-image ===========================================
// Removes a single image entry from a pin's images[] JSONB array, drops
// the URL from hero_photo_urls if it was a curated pick, and deletes the
// underlying file from the pin-images Storage bucket when no other pin
// references the same URL.
//
// Body: { pinId: string, url: string }
//
// Use cases:
//   - Drop a stale codex AI poster after a real photo arrives
//   - Drop a Wikidata image that's wrong for the place
//   - Drop a duplicate import
//
// Irreversible. The caller should confirm before posting.
//
// Auth: middleware.ts gates /api/admin/* with HTTP basic.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
  let body: { pinId?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const pinId = typeof body?.pinId === 'string' ? body.pinId : '';
  const url = typeof body?.url === 'string' ? body.url : '';
  if (!pinId || !url) {
    return NextResponse.json(
      { error: 'pinId and url required' },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  // Fetch the pin row so we can rebuild images[] without the target URL
  // and clean hero_photo_urls in the same write.
  const { data: pin, error: pinErr } = await sb
    .from('pins')
    .select('id, images, hero_photo_urls')
    .eq('id', pinId)
    .maybeSingle();
  if (pinErr) {
    return NextResponse.json({ error: pinErr.message }, { status: 500 });
  }
  if (!pin) {
    return NextResponse.json({ error: 'pin not found' }, { status: 404 });
  }

  const images = Array.isArray(pin.images) ? pin.images : [];
  const remaining = images.filter(
    (img: { url?: string } | null) => img?.url !== url,
  );
  if (remaining.length === images.length) {
    return NextResponse.json(
      { error: 'image url not found on this pin' },
      { status: 404 },
    );
  }

  const heroUrls = Array.isArray(pin.hero_photo_urls) ? pin.hero_photo_urls : [];
  const heroFiltered = heroUrls.filter((u: string) => u !== url);

  const { error: updErr } = await sb
    .from('pins')
    .update({ images: remaining, hero_photo_urls: heroFiltered })
    .eq('id', pinId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Storage cleanup. Only delete the file when:
  //   1. The URL points at our pin-images bucket (we don't own Wikidata /
  //      Commons / OSM URLs, those mustn't be touched).
  //   2. No OTHER pin still references this URL — checking pin.images
  //      across the corpus via the JSONB containment operator.
  let deletedFromStorage = false;
  const storageMatch = url.match(
    /\/storage\/v1\/object\/public\/pin-images\/(.+)$/,
  );
  const storagePath = storageMatch ? storageMatch[1] : null;
  if (storagePath) {
    const { data: otherPins, error: refErr } = await sb
      .from('pins')
      .select('id')
      .contains('images', [{ url }])
      .neq('id', pinId)
      .limit(1);
    if (refErr) {
      console.warn('[pin-image DELETE] reference probe failed:', refErr.message);
    }
    const stillReferenced = !refErr && (otherPins ?? []).length > 0;
    if (!stillReferenced) {
      const { error: storageErr } = await sb.storage
        .from('pin-images')
        .remove([storagePath]);
      if (storageErr) {
        console.warn('[pin-image DELETE] storage remove failed:', storageErr.message);
      } else {
        deletedFromStorage = true;
      }
    }
  }

  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }

  return NextResponse.json({
    ok: true,
    deletedFromStorage,
    remainingImageCount: remaining.length,
  });
}
