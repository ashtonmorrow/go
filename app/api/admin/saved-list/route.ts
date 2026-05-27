import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listNameToSlug } from '@/lib/savedLists';

// === /api/admin/saved-list ==================================================
// Bulk operations on Mike's personal saved-list memberships.
//
// POST { action: 'rename', from: '<old>', to: '<new>' }
//   → every pin where saved_lists ? from gets the entry replaced with `to`.
//     Idempotent — re-running with the same from/to is a no-op.
//
// POST { action: 'delete', name: '<list>' }
//   → every pin where saved_lists ? name has the entry removed. The pin
//     itself stays (we never auto-delete pins from a list deletion). The
//     metadata row in `saved_lists` is also dropped.
//
// POST { action: 'updateMeta', name, google_share_url?, description? }
//   → upsert metadata for a list. Empty string clears the URL.
//
// POST { action: 'create', name }
//   → seed an empty list (saved_lists metadata row only). The list shows
//     up in the admin UI even with zero members so it can be filled in.
//
// POST { action: 'addPin', name, pinId } / { action: 'removePin', name, pinId }
//   → toggle a single pin's membership in a list. Idempotent on both
//     sides; safe to spam from a checkbox UI.
//
// POST { action: 'setCover', name,
//        cover_photo_id?: uuid|null,
//        cover_pin_id?: uuid|null,
//        cover_image_url?: string|null }
//   → curate the cover image shown on /lists. Any subset of the three
//     fields can be set or nulled independently. Fields not present on
//     the body are left alone. The /lists cover resolver prefers
//     cover_image_url (any URL — codex art, city/country hero photo)
//     over cover_photo_id (personal_photos row) over cover_pin_id
//     (first image of the pin) over the geo / pin-pile fallbacks.
//
// POST { action: 'setPinOrder', name, pinIds: string[] }
//   → curate the order pins render in on /lists/<slug>. Members not
//     present in pinIds fall to the end in default sort order. addPin
//     and removePin auto-maintain the array (append on add, filter on
//     remove) so callers don't need to reconcile manually.
//
// All ops bust the public-pages cache so /lists and /lists/<slug> reflect
// the change after a single deploy-free roundtrip.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RenameBody = { action: 'rename'; from: string; to: string };
type DeleteBody = { action: 'delete'; name: string };
type UpdateMetaBody = {
  action: 'updateMeta';
  name: string;
  google_share_url?: string | null;
  description?: string | null;
  /** When supplied, updates saved_lists.slug for this list. Must be
   *  URL-safe (lowercase letters, digits, dashes) and globally unique
   *  across saved_lists. The slug is the URL identifier; the name is
   *  the display label. Editable independently since May 2026. */
  slug?: string;
};
type CreateBody = { action: 'create'; name: string };
type AddPinBody = { action: 'addPin'; name: string; pinId: string };
type RemovePinBody = { action: 'removePin'; name: string; pinId: string };
type SetCoverBody = {
  action: 'setCover';
  name: string;
  /** uuid → set; null → clear; undefined → leave alone. */
  cover_photo_id?: string | null;
  cover_pin_id?: string | null;
  /** Full URL → set; null → clear; undefined → leave alone. Used when
   *  the cover comes from a source that isn't a personal_photos row
   *  (codex art, Wikidata pin image, city/country hero photo). */
  cover_image_url?: string | null;
};
type SetPinOrderBody = {
  action: 'setPinOrder';
  name: string;
  pinIds: string[];
};
type Body =
  | RenameBody
  | DeleteBody
  | UpdateMetaBody
  | CreateBody
  | AddPinBody
  | RemovePinBody
  | SetCoverBody
  | SetPinOrderBody;

function normalizeName(s: string): string {
  // Saved-list names are lowercase + space-separated in the DB. Trim &
  // collapse whitespace to match the import script's slugify_list_name.
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Resolve a list `name` to its `saved_lists.slug`. After the May 2026
 *  R2 migration, pins.saved_lists[] holds slugs, so any operation that
 *  touches pin membership has to convert name → slug first. Falls back
 *  to listNameToSlug(name) for orphan lists with no meta row. */
async function resolveSlug(
  sb: ReturnType<typeof supabaseAdmin>,
  name: string,
): Promise<string> {
  const { data } = await sb
    .from('saved_lists')
    .select('slug')
    .eq('name', name)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? listNameToSlug(name);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  if (body.action === 'rename') {
    const from = normalizeName(body.from ?? '');
    const to = normalizeName(body.to ?? '');
    if (!from || !to) {
      return NextResponse.json(
        { error: 'rename requires non-empty `from` and `to`' },
        { status: 400 },
      );
    }
    if (from === to) {
      return NextResponse.json({ updated: 0, message: 'no-op' });
    }

    // Post-R2-migration, pins.saved_lists[] holds slugs — and slugs are
    // independent of name and stable across rename. So a rename is just
    // a meta-row update; no pin rewrite is needed (which dropped the
    // RPC-or-fallback dance the pre-migration code carried). The URL
    // identifier sits on saved_lists.slug, which is also unchanged.
    const { error: updErr } = await sb
      .from('saved_lists')
      .update({ name: to, updated_at: new Date().toISOString() })
      .eq('name', from);
    if (updErr) {
      // Likely a uniqueness collision if `to` already exists as a meta
      // row. Surface as 409 so the admin can rename around it.
      if (updErr.code === '23505' || /duplicate key|unique/i.test(updErr.message)) {
        return NextResponse.json(
          { error: `meta row for "${to}" already exists; rename to another name or merge manually first` },
          { status: 409 },
        );
      }
      console.error('[saved-list] rename: meta-row update failed:', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    bustCaches(from, to);
    return NextResponse.json({ updated: 1 });
  }

  if (body.action === 'delete') {
    const name = normalizeName(body.name ?? '');
    if (!name) {
      return NextResponse.json({ error: 'delete requires `name`' }, { status: 400 });
    }
    // Look up the slug first — pins.saved_lists[] stores slugs, not
    // names, so the cleanup pass has to filter by slug.
    const slug = await resolveSlug(sb, name);
    const result = await deleteByQuery(sb, slug);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    // Also delete the metadata row so it doesn't linger as a ghost entry.
    await sb.from('saved_lists').delete().eq('name', name);
    bustCaches(name);
    return NextResponse.json({ updated: result.updated });
  }

  if (body.action === 'updateMeta') {
    const name = normalizeName(body.name ?? '');
    if (!name) {
      return NextResponse.json({ error: 'updateMeta requires `name`' }, { status: 400 });
    }
    // Lightweight URL sanity — accept maps.app.goo.gl, maps.google.com,
    // and goo.gl/maps shortlinks. Empty string clears the URL.
    let cleanedUrl: string | null | undefined;
    if (body.google_share_url === undefined) {
      cleanedUrl = undefined;
    } else if (body.google_share_url === null || body.google_share_url.trim() === '') {
      cleanedUrl = null;
    } else {
      const u = body.google_share_url.trim();
      if (!/^https?:\/\//.test(u)) {
        return NextResponse.json({ error: 'google_share_url must be an http(s) URL' }, { status: 400 });
      }
      cleanedUrl = u;
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (cleanedUrl !== undefined) patch.google_share_url = cleanedUrl;
    if (body.description !== undefined) {
      patch.description = body.description?.trim() || null;
    }
    // Slug: optional explicit override of saved_lists.slug. Validate the
    // shape (lowercase letters/digits/dashes only, no leading/trailing
    // dash, no consecutive dashes) and let the unique constraint catch
    // collisions. If the slug is the only thing changing we still bust
    // the URL-keyed caches below.
    //
    // When the slug actually changes, pins.saved_lists[] still references
    // the old slug — every pin needs the entry rewritten. Capture the
    // old slug first so we can do that pass after the meta-row update
    // commits.
    let oldSlugForRewrite: string | null = null;
    if (body.slug !== undefined) {
      const s = (body.slug ?? '').trim().toLowerCase();
      if (!s) {
        return NextResponse.json({ error: 'slug cannot be empty' }, { status: 400 });
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
        return NextResponse.json(
          {
            error:
              'slug must be lowercase letters, digits, and dashes (no leading/trailing dash, no consecutive dashes)',
          },
          { status: 400 },
        );
      }
      patch.slug = s;
      const currentSlug = await resolveSlug(sb, name);
      if (currentSlug !== s) {
        oldSlugForRewrite = currentSlug;
      }
    }
    // Upsert so the row exists even for lists that haven't gotten metadata yet.
    const { error } = await sb.from('saved_lists').upsert({ name, ...patch });
    if (error) {
      // Surface the unique-constraint collision as a 409 with a readable
      // message rather than a generic 500.
      if (error.code === '23505' || /duplicate key|unique/i.test(error.message)) {
        return NextResponse.json(
          { error: 'slug already in use by another list' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // If the slug column itself changed, rewrite every pin's
    // saved_lists[] entry from the old slug to the new one so
    // membership stays consistent with the renamed identifier.
    if (oldSlugForRewrite && typeof patch.slug === 'string') {
      const rewrite = await renameByQuery(sb, oldSlugForRewrite, patch.slug);
      if (rewrite.error) {
        console.error('[saved-list] slug rename: pin rewrite failed:', rewrite.error);
      }
    }
    // Bust the saved-lists-meta cache so the new URL surfaces immediately on
    // /lists, /lists/<slug>, and any city/country page that links to it.
    try {
      revalidateTag('saved-lists-meta');
    } catch {
      /* ignore */
    }
    bustCaches(name);
    // When the slug column itself changed, also bust the path keyed on
    // the new slug so the freshly-pointed URL renders without waiting
    // for the next ISR window.
    if (patch.slug && typeof patch.slug === 'string') {
      try {
        revalidatePath(`/lists/${patch.slug}`);
        revalidatePath(`/admin/lists/${patch.slug}`);
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'create') {
    const name = normalizeName(body.name ?? '');
    if (!name) {
      return NextResponse.json({ error: 'create requires `name`' }, { status: 400 });
    }
    // Upsert into the saved_lists metadata table. The list now exists in
    // the admin UI even though no pin carries it — Mike can populate it
    // from the list-detail page next.
    const { error } = await sb.from('saved_lists').upsert(
      { name, updated_at: new Date().toISOString() },
      { onConflict: 'name' },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    try { revalidateTag('saved-lists-meta'); } catch {/* ignore */}
    bustCaches(name);
    return NextResponse.json({ ok: true, name });
  }

  if (body.action === 'addPin' || body.action === 'removePin') {
    const name = normalizeName(body.name ?? '');
    const pinId = (body.pinId ?? '').trim();
    if (!name || !pinId) {
      return NextResponse.json(
        { error: `${body.action} requires \`name\` and \`pinId\`` },
        { status: 400 },
      );
    }
    // pins.saved_lists[] stores slugs (post-R2-migration), so convert the
    // incoming name → slug before adding or removing from the array. The
    // API contract still accepts `name` to keep the admin UI stable.
    const slug = await resolveSlug(sb, name);
    // Read-modify-write the single pin's saved_lists array. The set
    // is small (rarely more than 5–10 entries), so the round-trip is fine.
    const { data: pinRow, error: selErr } = await sb
      .from('pins')
      .select('id, saved_lists')
      .eq('id', pinId)
      .maybeSingle();
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
    if (!pinRow) return NextResponse.json({ error: 'pin not found' }, { status: 404 });

    const current = (pinRow.saved_lists as string[]) ?? [];
    const next = body.action === 'addPin'
      ? Array.from(new Set([...current, slug])).sort()
      : current.filter(s => s !== slug);
    // Skip the write if nothing changed — keeps updated_at honest.
    if (next.length === current.length && next.every((v, i) => v === current[i])) {
      return NextResponse.json({ ok: true, changed: false });
    }
    const { error: updErr } = await sb
      .from('pins')
      .update({ saved_lists: next, updated_at: new Date().toISOString() })
      .eq('id', pinId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Maintain saved_lists.pin_order so the curated drag-reorder array
    // stays in sync with membership: append on add, filter on remove.
    // Read-modify-write — the metadata row is small and the list is
    // bounded in practice. Upsert handles the case where the row didn't
    // exist yet (newly-touched list names).
    const { data: metaRow, error: metaErr } = await sb
      .from('saved_lists')
      .select('name, pin_order')
      .eq('name', name)
      .maybeSingle();
    if (metaErr) {
      console.error('[saved-list] pin_order read failed:', metaErr);
    } else {
      const currentOrder = ((metaRow?.pin_order as string[] | null) ?? []).filter(
        x => typeof x === 'string',
      );
      let nextOrder: string[];
      if (body.action === 'addPin') {
        nextOrder = currentOrder.includes(pinId)
          ? currentOrder
          : [...currentOrder, pinId];
      } else {
        nextOrder = currentOrder.filter(id => id !== pinId);
      }
      const orderChanged =
        nextOrder.length !== currentOrder.length ||
        nextOrder.some((v, i) => v !== currentOrder[i]);
      if (orderChanged || !metaRow) {
        await sb.from('saved_lists').upsert(
          {
            name,
            pin_order: nextOrder,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'name' },
        );
      }
    }
    try { revalidateTag('saved-lists-meta'); } catch {/* ignore */}
    bustCaches(name);
    return NextResponse.json({ ok: true, changed: true });
  }

  if (body.action === 'setCover') {
    const name = normalizeName(body.name ?? '');
    if (!name) {
      return NextResponse.json({ error: 'setCover requires `name`' }, { status: 400 });
    }
    // Build a partial patch — only fields explicitly supplied get touched.
    // null clears, a uuid string sets, undefined leaves the column alone.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body, 'cover_photo_id')) {
      const v = body.cover_photo_id;
      if (v !== null && (typeof v !== 'string' || !v.trim())) {
        return NextResponse.json(
          { error: 'cover_photo_id must be a uuid string or null' },
          { status: 400 },
        );
      }
      patch.cover_photo_id = v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'cover_pin_id')) {
      const v = body.cover_pin_id;
      if (v !== null && (typeof v !== 'string' || !v.trim())) {
        return NextResponse.json(
          { error: 'cover_pin_id must be a uuid string or null' },
          { status: 400 },
        );
      }
      patch.cover_pin_id = v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'cover_image_url')) {
      const v = body.cover_image_url;
      if (v !== null && (typeof v !== 'string' || !v.trim())) {
        return NextResponse.json(
          { error: 'cover_image_url must be a URL string or null' },
          { status: 400 },
        );
      }
      // Light-touch URL validation — has to start with http(s):// to be
      // renderable. The picker only ever passes URLs we already render,
      // but a fat-finger PATCH from outside should fail loudly.
      if (typeof v === 'string' && !/^https?:\/\//.test(v)) {
        return NextResponse.json(
          { error: 'cover_image_url must be an http(s) URL' },
          { status: 400 },
        );
      }
      patch.cover_image_url = v;
    }
    // Upsert so a list whose metadata row hasn't been created yet still
    // gets the cover. ON CONFLICT rebases on `name` (the PK).
    const { error } = await sb.from('saved_lists').upsert(
      { name, ...patch },
      { onConflict: 'name' },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    try { revalidateTag('saved-lists-meta'); } catch { /* ignore */ }
    bustCaches(name);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'setPinOrder') {
    const name = normalizeName(body.name ?? '');
    if (!name) {
      return NextResponse.json({ error: 'setPinOrder requires `name`' }, { status: 400 });
    }
    if (!Array.isArray(body.pinIds)) {
      return NextResponse.json(
        { error: 'pinIds must be an array of uuid strings' },
        { status: 400 },
      );
    }
    // Filter to plain strings + dedupe so we don't trust the client to
    // hand us a clean array. Order within `pinIds` is preserved
    // because Set + spread keeps insertion order in V8.
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const v of body.pinIds) {
      if (typeof v !== 'string' || !v.trim()) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      cleaned.push(v);
    }
    const { error } = await sb.from('saved_lists').upsert(
      {
        name,
        pin_order: cleaned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    try { revalidateTag('saved-lists-meta'); } catch { /* ignore */ }
    bustCaches(name);
    return NextResponse.json({ ok: true, count: cleaned.length });
  }

  return NextResponse.json(
    {
      error:
        'action must be rename | delete | updateMeta | create | addPin | removePin | setCover | setPinOrder',
    },
    { status: 400 },
  );
}

/** Rewrite every pin's saved_lists[] entry from `fromSlug` → `toSlug`.
 *  Used by the slug-rename path on updateMeta; pins.saved_lists[] stores
 *  slugs, so a slug change requires a sweep across the pin corpus. */
async function renameByQuery(
  sb: ReturnType<typeof supabaseAdmin>,
  fromSlug: string,
  toSlug: string,
): Promise<{ updated: number; error?: string }> {
  const { data: hits, error: selErr } = await sb
    .from('pins')
    .select('id, saved_lists')
    .contains('saved_lists', [fromSlug]);
  if (selErr) return { updated: 0, error: selErr.message };
  let updated = 0;
  for (const row of hits ?? []) {
    const next = Array.from(
      new Set(
        ((row.saved_lists as string[]) ?? []).map(s => (s === fromSlug ? toSlug : s)),
      ),
    ).sort();
    const { error: updErr } = await sb.from('pins').update({ saved_lists: next }).eq('id', row.id);
    if (!updErr) updated++;
  }
  return { updated };
}

/** Delete a list slug from every pin that carries it. */
async function deleteByQuery(
  sb: ReturnType<typeof supabaseAdmin>,
  slug: string,
): Promise<{ updated: number; error?: string }> {
  const { data: hits, error: selErr } = await sb
    .from('pins')
    .select('id, saved_lists')
    .contains('saved_lists', [slug]);
  if (selErr) return { updated: 0, error: selErr.message };
  let updated = 0;
  for (const row of hits ?? []) {
    const next = ((row.saved_lists as string[]) ?? []).filter(s => s !== slug);
    const { error: updErr } = await sb.from('pins').update({ saved_lists: next }).eq('id', row.id);
    if (!updErr) updated++;
  }
  return { updated };
}

function bustCaches(...affectedListNames: string[]) {
  try {
    revalidateTag('supabase-pins');
    // Also bust the saved-lists metadata cache — the admin page and the
    // public /lists pages read it on every render and would otherwise
    // serve a 5-minute-stale snapshot of the metadata table after a
    // delete/create, making the change look like it didn't take.
    revalidateTag('saved-lists-meta');
    revalidatePath('/lists');
    revalidatePath('/admin/lists');
    for (const name of affectedListNames) {
      const slug = listNameToSlug(name);
      if (slug) {
        revalidatePath(`/lists/${slug}`);
        revalidatePath(`/admin/lists/${slug}`);
      }
    }
  } catch {
    /* ignore */
  }
}
