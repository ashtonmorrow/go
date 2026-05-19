import { promises as fs } from 'fs';
import path from 'path';
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
//
// Deleting the pin row does NOT scrub `[Name](/pins/<slug>)` links out of
// the hand-authored guide markdown. After a successful delete the route
// scans content/lists for the slug and returns a `warning` listing any
// guides that still link it, so the admin UI can flag the dead links.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Scan content/lists/*.md for markdown links to a now-deleted pin slug.
 *  Returns the guide slugs that still reference it. Best-effort: if the
 *  bundled content dir is not readable, returns []. */
async function guidesLinkingPin(slug: string): Promise<string[]> {
  const needle = `(/pins/${slug})`;
  const out: string[] = [];
  try {
    const dir = path.join(process.cwd(), 'content', 'lists');
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const body = await fs.readFile(path.join(dir, f), 'utf8');
      if (body.includes(needle)) out.push(f.replace(/\.md$/, ''));
    }
  } catch {
    /* content dir not readable in this runtime — skip the scan */
  }
  return out;
}

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

  // `.select()` makes the DELETE return the rows it actually removed. Without
  // it, a delete that matches zero rows (RLS silently blocking a non-service
  // client, a race, a stale id) still comes back with `error: null` — the
  // route would report a phantom success and the pin would quietly survive.
  // Verifying the row count turns that failure mode into a real 500.
  const { data: deleted, error: delErr } = await sb
    .from('pins')
    .delete()
    .eq('id', pinId)
    .select('id');
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json(
      { error: 'delete removed 0 rows — the pin was not deleted' },
      { status: 500 },
    );
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

  // The pin row is gone, but guide markdown that linked it now carries a
  // dead /pins/<slug> link. Surface those so the admin can fix the prose.
  const referencedIn = pin.slug ? await guidesLinkingPin(pin.slug) : [];
  const warning =
    referencedIn.length > 0
      ? `Still linked in ${referencedIn.length} guide${
          referencedIn.length === 1 ? '' : 's'
        }: ${referencedIn.join(', ')}. Edit the markdown to drop the dead link.`
      : undefined;

  return NextResponse.json({
    ok: true,
    deleted: { id: pin.id, name: pin.name },
    referencedIn,
    warning,
  });
}
