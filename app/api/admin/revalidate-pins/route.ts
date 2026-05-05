import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';

// === POST /api/admin/revalidate-pins ========================================
// Dedicated cache-bust endpoint. Exists because revalidateTag /
// revalidatePath calls inside the streaming /api/admin/enrich-places
// route's ReadableStream.start() callback don't reliably fire — by the
// time the post-stream code runs, the original route handler has
// already returned its Response and the request context that
// revalidateTag relies on may be gone, so the call silently no-ops.
//
// The client (admin Enrich buttons, in both bulk and per-pin form)
// POSTs here AFTER the enrichment NDJSON stream completes. Clean
// request context, revalidation always works.
//
// Auth: middleware.ts gates /api/admin/* behind HTTP basic. By the
// time we land here the caller has the admin password. No extra check
// needed.
//
// Body (all optional):
//   { slugs?: string[] }  pin slugs that were enriched. Used to
//     revalidatePath('/pins/<slug>') for each — belt-and-suspenders
//     alongside the tag bust. Empty / missing = tag bust only.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — we still bust the tag */
  }
  const b = body as { slugs?: unknown };
  const slugs = Array.isArray(b.slugs)
    ? b.slugs.filter((s): s is string => typeof s === 'string')
    : [];

  try {
    // Tag bust evicts every unstable_cache entry tagged 'supabase-pins'
    // — fetchPinBySlug, fetchAllPins, fetchPinsForLists,
    // fetchPinsInBbox. One call covers every cached read.
    revalidateTag('supabase-pins');

    // Slug-level path revalidation in case any route-segment cache
    // exists for those pages. /pins/[slug] is dynamic so this is
    // mostly redundant, but it's cheap and harmless.
    for (const slug of slugs) {
      revalidatePath(`/pins/${slug}`);
    }
    // Index pages — index views read fetchAllPins which is already
    // covered by the tag bust, but path-bust them too for thoroughness.
    revalidatePath('/pins/cards');
    revalidatePath('/pins/map');
    revalidatePath('/pins/table');
    revalidatePath('/pins/stats');
  } catch (err) {
    console.error('[revalidate-pins] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'revalidate failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    bustedTag: 'supabase-pins',
    bustedSlugCount: slugs.length,
  });
}
