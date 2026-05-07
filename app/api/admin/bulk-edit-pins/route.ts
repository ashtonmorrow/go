import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === /api/admin/bulk-edit-pins =============================================
// Accepts a list of per-row patches and writes them in one round trip per
// pin. The field allowlist is intentionally narrow so this endpoint only
// covers the four columns the bulk editor on /admin/pins exposes — full
// pin editing still goes through /api/admin/update-pin where the user
// sees one row at a time and the surface area is appropriate.
//
// Body: { changes: [{ id: string, fields: { visited?, kind?, indexable?, personal_rating? } }] }

const ALLOWED_KINDS = new Set(['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit']);

type FieldName = 'visited' | 'kind' | 'indexable' | 'personal_rating';
type FieldPatch = Partial<{
  visited: boolean;
  kind: string | null;
  indexable: boolean;
  personal_rating: number | null;
}>;
type Change = { id: string; fields: FieldPatch };

function sanitize(fields: Record<string, unknown>): { ok: FieldPatch; reason?: string } {
  const out: FieldPatch = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'visited' && typeof v === 'boolean') out.visited = v;
    else if (k === 'indexable' && typeof v === 'boolean') out.indexable = v;
    else if (k === 'kind') {
      if (v === null) out.kind = null;
      else if (typeof v === 'string' && ALLOWED_KINDS.has(v)) out.kind = v;
      else return { ok: out, reason: `invalid kind: ${String(v)}` };
    } else if (k === 'personal_rating') {
      if (v === null) out.personal_rating = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5) {
        out.personal_rating = Math.round(v);
      } else return { ok: out, reason: `personal_rating must be 1-5 or null` };
    }
    // anything else: silently ignore (allowlist)
  }
  return { ok: out };
}

export async function POST(req: Request) {
  let body: { changes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const raw = Array.isArray(body?.changes) ? body.changes : [];
  if (raw.length === 0) return NextResponse.json({ updated: 0 });

  const valid: Change[] = [];
  for (const c of raw as Array<{ id?: unknown; fields?: unknown }>) {
    if (typeof c?.id !== 'string' || !c.id) continue;
    if (!c.fields || typeof c.fields !== 'object') continue;
    const { ok, reason } = sanitize(c.fields as Record<string, unknown>);
    if (reason) {
      return NextResponse.json({ error: `${c.id}: ${reason}` }, { status: 400 });
    }
    if (Object.keys(ok).length === 0) continue;
    valid.push({ id: c.id, fields: ok });
  }
  if (valid.length === 0) return NextResponse.json({ updated: 0 });

  const sb = supabaseAdmin();

  // Issue updates in parallel — Supabase tolerates concurrent UPDATEs on
  // distinct rows. Per-row vs. bulk-by-field is a wash here because each
  // row has its own field patch; bulk-by-(field, value) tuples would
  // require grouping rows that happen to share a value, which is a small
  // optimization for the typical ~20-row save and not worth the code.
  const results = await Promise.all(
    valid.map(c =>
      sb
        .from('pins')
        .update(c.fields as Record<string, unknown>)
        .eq('id', c.id)
        .select('id')
        .maybeSingle()
        .then(r => ({ id: c.id, error: r.error })),
    ),
  );

  const errors = results.filter(r => r.error).map(r => `${r.id}: ${r.error?.message}`);
  const updated = results.length - errors.length;

  try { revalidateTag('supabase-pins'); } catch { /* ignore */ }

  if (errors.length) {
    return NextResponse.json({ updated, errors }, { status: 500 });
  }
  return NextResponse.json({ updated });
}

export type BulkEditAllowedField = FieldName;
