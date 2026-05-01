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
//     itself stays (we never auto-delete pins from a list deletion).
//
// All ops bust the public-pages cache so /lists and /lists/<slug> reflect
// the change after a single deploy-free roundtrip.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RenameBody = { action: 'rename'; from: string; to: string };
type DeleteBody = { action: 'delete'; name: string };
type Body = RenameBody | DeleteBody;

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
    bustCaches(name);
    return NextResponse.json({ updated: result.updated });
  }

  return NextResponse.json({ error: 'action must be rename | delete' }, { status: 400 });
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
