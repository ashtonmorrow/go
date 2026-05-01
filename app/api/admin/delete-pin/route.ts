import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// === /api/admin/delete-pin ==================================================
// Hard-delete a single pin from the database. Used by the per-pin admin
// editor's red "Delete" button and the list-detail roster's row-level
// delete control. The pin record is removed; its personal_photos rows
// follow via the FK ON DELETE CASCADE. Saved-list memberships go with the
// pin (no cleanup needed — the array column lives on the pin itself).
//
// POST { pinId: string }
//   → 200 { ok: true } on success
//   → 404 if pinId not found
//   → 500 on any DB error
//
// Caches busted on success:
//   * tag 'supabase-pins' (the unstable_cache key the index pages read)
//   * path '/pins/cards', '/pins/map', '/pins/table', '/pins/stats'
//   * path '/pins/<slug>' if the pin had one (the public detail page)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { pinId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const pinId = (body.pinId ?? '').trim();
  if (!pinId) {
    return NextResponse.json({ error: 'pinId required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Read the slug first so we can revalidate the public detail page after
  // the row is gone. One round-trip; the pin is small.
  const { data: pin, error: selErr } = await sb
    .from('pins')
    .select('id, slug, name')
    .eq('id', pinId)
    .maybeSingle();
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!pin) {
    return NextResponse.json({ error: 'pin not found' }, { status: 404 });
  }

  const { error: delErr } = await sb.from('pins').delete().eq('id', pinId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Invalidate every surface that might still reference the deleted row.
  try {
    revalidateTag('supabase-pins');
    revalidatePath('/pins/cards');
    revalidatePath('/pins/map');
    revalidatePath('/pins/table');
    revalidatePath('/pins/stats');
    if (pin.slug) revalidatePath(`/pins/${pin.slug}`);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, deleted: { id: pin.id, name: pin.name } });
}
