import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// === /api/admin/bulk-edit-pins =============================================
// Accepts a list of per-row patches and writes them in one round trip per
// pin. The field allowlist covers the columns the inline bulk editors on
// /admin/pins (visited / kind / indexable / personal_rating) and
// /admin/hotels (visit_year / nights_stayed / room_type / cash price /
// points) expose. Full pin editing still goes through /api/admin/update-pin
// where the user sees one row at a time and the surface area is broader.
//
// Body: { changes: [{ id: string, fields: <patch> }] }

const ALLOWED_KINDS = new Set(['attraction', 'shopping', 'hotel', 'park', 'restaurant', 'transit']);
const ALLOWED_POINTS_PROGRAMS = new Set(['ihg', 'marriott', 'hyatt', 'hilton']);

type FieldPatch = Partial<{
  // /admin/pins inline cells
  visited: boolean;
  kind: string | null;
  indexable: boolean;
  personal_rating: number | null;
  // /admin/pins inline review (kind-dispatched: hotel pins write to
  // generated_review which gates indexability; everything else writes
  // personal_review).
  personal_review: string | null;
  generated_review: string | null;
  // /admin/hotels inline cells
  visit_year: number | null;
  nights_stayed: number | null;
  room_type: string | null;
  room_price_per_night: number | null;
  room_price_currency: string | null;
  points_amount: number | null;
  points_program: string | null;
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
    } else if (k === 'visit_year') {
      if (v === null) out.visit_year = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 1900 && v <= 2100) {
        out.visit_year = Math.round(v);
      } else return { ok: out, reason: `visit_year must be 1900-2100 or null` };
    } else if (k === 'nights_stayed') {
      if (v === null) out.nights_stayed = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 365) {
        out.nights_stayed = Math.round(v);
      } else return { ok: out, reason: `nights_stayed must be 1-365 or null` };
    } else if (k === 'room_type') {
      if (v === null) out.room_type = null;
      else if (typeof v === 'string') out.room_type = v.trim() || null;
      else return { ok: out, reason: `room_type must be string or null` };
    } else if (k === 'room_price_per_night') {
      if (v === null) out.room_price_per_night = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        out.room_price_per_night = v;
      } else return { ok: out, reason: `room_price_per_night must be >=0 or null` };
    } else if (k === 'room_price_currency') {
      if (v === null) out.room_price_currency = null;
      else if (typeof v === 'string') {
        const c = v.trim().toUpperCase();
        if (c.length === 0) out.room_price_currency = null;
        else if (c.length <= 4) out.room_price_currency = c;
        else return { ok: out, reason: `room_price_currency must be a short ISO code` };
      } else return { ok: out, reason: `room_price_currency must be string or null` };
    } else if (k === 'points_amount') {
      if (v === null) out.points_amount = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        out.points_amount = Math.round(v);
      } else return { ok: out, reason: `points_amount must be >=0 or null` };
    } else if (k === 'points_program') {
      if (v === null) out.points_program = null;
      else if (typeof v === 'string' && ALLOWED_POINTS_PROGRAMS.has(v)) {
        out.points_program = v;
      } else return { ok: out, reason: `invalid points_program: ${String(v)}` };
    } else if (k === 'personal_review') {
      if (v === null) out.personal_review = null;
      else if (typeof v === 'string') out.personal_review = v.trim() || null;
      else return { ok: out, reason: `personal_review must be string or null` };
    } else if (k === 'generated_review') {
      if (v === null) out.generated_review = null;
      else if (typeof v === 'string') out.generated_review = v.trim() || null;
      else return { ok: out, reason: `generated_review must be string or null` };
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

export type BulkEditAllowedField = keyof FieldPatch;
