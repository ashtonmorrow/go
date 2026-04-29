import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createPinFromCandidate, type CandidatePlace } from '@/lib/findOrCreatePin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Assignment = {
  /** Hash of the uploaded photo (matches what's stored in personal_photos.hash). */
  photoHash: string;
  photoUrl: string;
  takenAt: string | null;
  exifLat: number | null;
  exifLng: number | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  caption: string | null;

  /** One of these three identifies the destination pin: */
  existingPinId?: string | null;
  newPinFromCandidate?: CandidatePlace | null;
};

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const assignments: Assignment[] = Array.isArray(body?.assignments) ? body.assignments : [];
  if (!assignments.length) {
    return NextResponse.json({ error: 'assignments[] required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const newPinCache = new Map<string, { id: string; slug: string }>();
  const created: Array<{ photoHash: string; pinId: string; pinSlug: string; isNew: boolean }> = [];
  const failed: Array<{ photoHash: string; error: string }> = [];

  for (const a of assignments) {
    try {
      let pinId = a.existingPinId ?? null;
      let pinSlug: string | null = null;
      let isNew = false;

      if (!pinId && a.newPinFromCandidate) {
        const cacheKey = `${a.newPinFromCandidate.name}:${a.newPinFromCandidate.lat}:${a.newPinFromCandidate.lng}`;
        const cached = newPinCache.get(cacheKey);
        if (cached) {
          pinId = cached.id;
          pinSlug = cached.slug;
        } else {
          const newPin = await createPinFromCandidate(a.newPinFromCandidate);
          if (newPin) {
            pinId = newPin.id;
            pinSlug = newPin.slug;
            isNew = true;
            newPinCache.set(cacheKey, newPin);
          }
        }
      } else if (pinId) {
        const { data } = await sb
          .from('pins')
          .select('slug')
          .eq('id', pinId)
          .maybeSingle();
        pinSlug = data?.slug ?? null;
      }

      if (!pinId) {
        failed.push({ photoHash: a.photoHash, error: 'no destination pin' });
        continue;
      }

      const { error: insertErr } = await sb.from('personal_photos').insert({
        pin_id: pinId,
        url: a.photoUrl,
        hash: a.photoHash,
        taken_at: a.takenAt,
        exif_lat: a.exifLat,
        exif_lng: a.exifLng,
        caption: a.caption,
        width: a.width,
        height: a.height,
        bytes: a.bytes,
      });

      if (insertErr && (insertErr as any).code !== '23505') {
        failed.push({ photoHash: a.photoHash, error: insertErr.message });
        continue;
      }

      // Mark visited if not already.
      await sb.from('pins').update({ visited: true }).eq('id', pinId).eq('visited', false);

      created.push({ photoHash: a.photoHash, pinId, pinSlug: pinSlug ?? '', isNew });
    } catch (e) {
      failed.push({
        photoHash: a.photoHash,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  // Bust the pins cache so the new photos appear immediately on detail pages.
  try {
    revalidateTag('supabase-pins');
  } catch {
    /* revalidateTag may not be available in some runtimes */
  }

  return NextResponse.json({ created, failed });
}
