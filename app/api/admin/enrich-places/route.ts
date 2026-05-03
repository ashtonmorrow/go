import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  enrichPins,
  type EnrichField,
} from '@/lib/placesEnrichment';

// === POST /api/admin/enrich-places ==========================================
// Streams enrichment progress as NDJSON (one JSON object per line). The
// admin button reads the response body line-by-line and updates its UI
// as events arrive. We keep the function on the Node.js runtime so we
// can hold the stream open for the full duration of the enrichment —
// edge runtime has tighter time + memory caps that would clip a long
// run mid-flight.
//
// Auth: middleware.ts already gates /api/admin/* behind HTTP basic
// auth, so by the time a request lands here the caller has the admin
// password. No additional auth is needed here.
//
// Request body:
//   { pinIds: string[],           — required, the filtered set
//     fields?: ('price'|'hours'|'website'|'phone')[],  default ['price','hours']
//     maxCostUsd?: number,         default no ceiling
//     refresh?: boolean,           default false (skip already-enriched)
//     dryRun?: boolean }           default false (live writes)
//
// Response: streaming NDJSON. Each line is one EnrichEvent
// (see lib/placesEnrichment.ts). Final line is { type: 'done', ... }.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Pro lets us hold a function open for 5 minutes. The default
// 10s would clip any non-trivial enrichment.
export const maxDuration = 300;

const ALLOWED_FIELDS: EnrichField[] = ['price', 'hours', 'website', 'phone'];

export async function POST(req: Request) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured' },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const b = body as {
    pinIds?: unknown;
    fields?: unknown;
    maxCostUsd?: unknown;
    refresh?: unknown;
    dryRun?: unknown;
  };

  if (!Array.isArray(b.pinIds) || b.pinIds.length === 0) {
    return NextResponse.json(
      { error: 'pinIds must be a non-empty array' },
      { status: 400 },
    );
  }
  const pinIds = b.pinIds.filter((x): x is string => typeof x === 'string');
  if (pinIds.length > 5000) {
    return NextResponse.json(
      { error: 'pinIds capped at 5000 per request' },
      { status: 400 },
    );
  }

  const fields = (Array.isArray(b.fields) ? b.fields : [])
    .filter((x): x is EnrichField =>
      typeof x === 'string' && (ALLOWED_FIELDS as string[]).includes(x),
    );
  const maxCostUsd = typeof b.maxCostUsd === 'number' ? b.maxCostUsd : undefined;
  const refresh = b.refresh === true;
  const dryRun = b.dryRun === true;

  const supabase = supabaseAdmin();

  // Stream the events out as NDJSON. Each chunk is one event +
  // newline; the client reads and parses line-by-line. Using a
  // ReadableStream lets us pump events as they're produced rather
  // than buffering until the entire run completes.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of enrichPins({
          apiKey,
          supabase,
          pinIds,
          fields: fields.length > 0 ? fields : undefined,
          maxCostUsd,
          refresh,
          dryRun,
        })) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        // Surface the error to the client as a final NDJSON line so
        // the UI can show it. Then close the stream cleanly.
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'error', message: msg }) + '\n'),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Disable buffering on Vercel's edge so events flush promptly.
      'X-Accel-Buffering': 'no',
    },
  });
}
