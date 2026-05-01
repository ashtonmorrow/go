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
};
type CreateBody = { action: 'create'; name: string };
type AddPinBody = { action: 'addPin'; name: string; pinId: string };
type RemovePinBody = { action: 'removePin'; name: string; pinId: string };
type Body = RenameBody | DeleteBody | UpdateMetaBody | CreateBody | AddPinBody | RemovePinBody;

function normalizeName(s: string): string {
  // Saved-list names are lowercase + space-separated in the DB. Trim &
  // collapse whitespace to match the import script's slugify_list_name.
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
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

    // Postgres doesn't have a native array-rename, so we drive it via SQL:
    // strip the old token, then append the new one (de-duped).
    const { data, error } = await sb.rpc('rename_saved_list', { from, to });
    if (error) {
      // Fall back to client-side if the RPC doesn't exist — this lets the
      // endpoint work without a stored procedure deploy.
      const fallback = await renameByQuery(sb, from, to);
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error }, { status: 500 });
      }
      bustCaches(from, to);
      return NextResponse.json({ updated: fallback.updated });
    }
    bustCaches(from, to);
    return NextResponse.json({ updated: data ?? 0 });
  }

  if (body.action === 'delete') {
    const name = normalizeName(body.name ?? '');
    if (!name) {
      return NextResponse.json({ error: 'delete requires `name`' }, { status: 400 });
    }
    const result = await deleteByQuery(sb, name);
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
    // Upsert so the row exists even for lists that haven't gotten metadata yet.
    const { error } = await sb.from('saved_lists').upsert({ name, ...patch });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Bust the saved-lists-meta cache so the new URL surfaces immediately on
    // /lists, /lists/<slug>, and any city/country page that links to it.
    try {
      revalidateTag('saved-lists-meta');
    } catch {
      /* ignore */
    }
    bustCaches(name);
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
      ? Array.from(new Set([...current, name])).sort()
      : current.filter(s => s !== name);
    // Skip the write if nothing changed — keeps updated_at honest.
    if (next.length === current.length && next.every((v, i) => v === current[i])) {
      return NextResponse.json({ ok: true, changed: false });
    }
    const { error: updErr } = await sb
      .from('pins')
      .update({ saved_lists: next, updated_at: new Date().toISOString() })
      .eq('id', pinId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Make sure the metadata row exists for newly-touched list names so
    // the admin UI shows them next render even if no other pin carries
    // the list yet.
    if (body.action === 'addPin') {
      await sb.from('saved_lists').upsert(
        { name, updated_at: new Date().toISOString() },
        { onConflict: 'name' },
      );
    }
    try { revalidateTag('saved-lists-meta'); } catch {/* ignore */}
    bustCaches(name);
    return NextResponse.json({ ok: true, changed: true });
  }

  return NextResponse.json(
    { error: 'action must be rename | delete | updateMeta | create | addPin | removePin' },
    { status: 400 },
  );
}

/** Rename a list across all pins by reading affected rows + re-writing. */
async function renameByQuery(
  sb: ReturnType<typeof supabaseAdmin>,
  from: string,
  to: string,
): Promise<{ updated: number; error?: string }> {
  const { data: hits, error: selErr } = await sb
    .from('pins')
    .select('id, saved_lists')
    .contains('saved_lists', [from]);
  if (selErr) return { updated: 0, error: selErr.message };
  let updated = 0;
  for (const row of hits ?? []) {
    const next = Array.from(
      new Set(
        ((row.saved_lists as string[]) ?? []).map(s => (s === from ? to : s)),
      ),
    ).sort();
    const { error: updErr } = await sb.from('pins').update({ saved_lists: next }).eq('id', row.id);
    if (!updErr) updated++;
  }
  return { updated };
}

/** Delete a list name from every pin that carries it. */
async function deleteByQuery(
  sb: ReturnType<typeof supabaseAdmin>,
  name: string,
): Promise<{ updated: number; error?: string }> {
  const { data: hits, error: selErr } = await sb
    .from('pins')
    .select('id, saved_lists')
    .contains('saved_lists', [name]);
  if (selErr) return { updated: 0, error: selErr.message };
  let updated = 0;
  for (const row of hits ?? []) {
    const next = ((row.saved_lists as string[]) ?? []).filter(s => s !== name);
    const { error: updErr } = await sb.from('pins').update({ saved_lists: next }).eq('id', row.id);
    if (!updErr) updated++;
  }
  return { updated };
}

function bustCaches(...affectedListNames: string[]) {
  try {
    revalidateTag('supabase-pins');
    revalidatePath('/lists');
    for (const name of affectedListNames) {
      const slug = listNameToSlug(name);
      if (slug) revalidatePath(`/lists/${slug}`);
    }
  } catch {
    /* ignore */
  }
}
