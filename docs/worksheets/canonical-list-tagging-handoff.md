# Canonical-list tagging handoff

Goal: bring the `Atlas Obscura` and `Michelin Guide` membership labels on
`pins.lists` to a defensible level of completeness so the corresponding
filter chips in `PinFilterPanel.tsx` actually surface meaningful results.

This is a self-contained brief. Everything an agent needs to start is in
this file plus the file pointers it lists.

---

## Phase 1 status: DONE (Wikidata SPARQL pass, May 2026)

Ran live SPARQL against all 1,160 pins with `wikidata_qid` set, querying
P3134 (Atlas Obscura) and P2208 (Michelin stars).

- 72 P3134 matches → 1 net-new tag added (Q156316, Würzburg Residence).
  The other 71 were already labeled by an earlier Wikidata enrichment pass.
- 0 P2208 matches. Wikidata genuinely doesn't have Michelin stars
  populated for the restaurants in this DB. Phase 2 is the only path.

Migration applied: `backfill_atlas_obscura_from_wikidata` (idempotent,
re-runnable). After: 72 Atlas / 0 Michelin / 1,158 UNESCO / 5,122 total.

## Current state (Stray Supabase, project `pdjrvlhepiwkshxerkpz`)

| Field                         | Coverage  |
| ----------------------------- | --------- |
| Total pins                    | 5,122     |
| `wikidata_qid` set            | 1,160     |
| Labeled `UNESCO World Heritage` | 1,158   |
| Labeled `Atlas Obscura`       | 72        |
| Labeled `Michelin Guide`      | 0         |
| `kind = 'restaurant'`         | 2,151     |

Run the same query yourself before starting:

```sql
SELECT
  COUNT(*) FILTER (WHERE 'Atlas Obscura'  = ANY(lists)) AS labeled_atlas_obscura,
  COUNT(*) FILTER (WHERE 'Michelin Guide' = ANY(lists)) AS labeled_michelin,
  COUNT(*) FILTER (WHERE wikidata_qid IS NOT NULL)      AS has_wikidata_qid,
  COUNT(*)                                              AS total_pins
FROM pins;
```

---

## Schema + invariants

- `pins.lists` is `text[]`. Each entry must come from the `CanonicalList`
  union in `lib/pinLists.ts`; everything else gets dropped by
  `normaliseLists()` defined in the same file.
- The current canonical set:
  ```
  'UNESCO World Heritage', 'UNESCO Tentative List',
  'Atlas Obscura', 'Michelin Guide',
  'Ramsar Wetland', 'International Dark Sky Park',
  'IUGS Geological Heritage Site',
  'New 7 Wonders', '7 Natural Wonders', '7 Ancient Wonders'
  ```
- Always go through `normaliseLists()` (or the SQL equivalent) when
  writing — it dedupes and drops noise. Migration
  `pins_canonical_lists_cleanup` already collapsed Wikidata's many
  variant labels into the canonical names; don't reintroduce them.
- `pins.wikidata_qid` is the QID without the `Q` prefix on some rows
  and with the prefix on others — confirm the format on a sample
  before writing SPARQL queries.
- `pins.lists` writes are admin-only via `pins.lists` array update —
  RLS is on, so use the `service_role` client (the existing
  `lib/supabaseAdmin.ts` pattern, or the Supabase MCP `apply_migration`
  tool from another agent).
- After a bulk write, bust the public-page cache. Two paths:
  - SQL: do nothing — `unstable_cache` will TTL out in 24h.
  - Cleaner: hit `POST /api/admin/revalidate-pins` with body
    `{ "slugs": ["..."] }` (basic-auth gated by middleware).

---

## Approach — two-phase plan

### Phase 1 — Wikidata SPARQL pass (free, deterministic)

For the 1,160 pins with `wikidata_qid` set, query Wikidata for two
properties:

- **P3134** — Atlas Obscura ID. Presence = listed on Atlas Obscura.
- **P2208** — Michelin Guide stars. Presence = listed in Michelin
  Guide. Star count is a bonus (could go in a future
  `michelin_stars int` column; out of scope here).

Bulk SPARQL example (chunked at ~100 QIDs per query to stay under
URL/timeout limits):

```sparql
SELECT ?qid ?atlas ?michelin WHERE {
  VALUES ?qid { wd:Q123 wd:Q456 wd:Q789 ... }
  OPTIONAL { ?qid wdt:P3134 ?atlas . }
  OPTIONAL { ?qid wdt:P2208 ?michelin . }
}
```

Endpoint: `https://query.wikidata.org/sparql` (set `Accept: application/sparql-results+json`).

For each row in the response:
- If `?atlas` present → add `'Atlas Obscura'` to that pin's `lists`.
- If `?michelin` present → add `'Michelin Guide'`.

### Phase 2 — Restaurant gap-fill for Michelin (DEFERRED, see notes)

Wikidata covers maybe 5–15% of Michelin's ~3,500 entries — most
restaurants don't have Wikidata pages. So Phase 1 won't catch the
long tail. For the ~2,151 `kind = 'restaurant'` pins:

- Scrape `https://guide.michelin.com/<region>/<city>/restaurant/<slug>`
  matching by name + city + country. The site has a search at
  `https://guide.michelin.com/en/search?q=...`.
- For each match, capture the canonical Michelin URL and any
  recognition tier (Star / Bib Gourmand / Recommended / Plate).

**Important findings (May 2026):**

1. `guide.michelin.com` is fully Cloudflare-protected. Direct `curl`,
   Claude's `WebFetch`, and most user-agent-spoofed requests get
   HTTP 202 (challenge) or HTTP 403 (blocked). A real headless browser
   (Playwright / Puppeteer with stealth plugin) is required, or a
   server-rendered fallback like the `?_data=...` Remix loader URLs
   that some pages expose.
2. Mike's restaurant set skews **local favorites** over fine dining —
   top-rated entries are places like a Cordoba comedor, a Belluno
   takeaway, a Larnaca falafel shop. Realistic Michelin yield is
   probably <5% of the 2,151, concentrated in major culinary cities
   (Tokyo, Paris, San Sebastián, Singapore, NYC, HK, Bangkok, KL).
3. Pre-filter aggressively before scraping. The cheapest gating
   signal is `cityNames` ∩ {known Michelin cities}: limits to maybe
   400-600 candidates and spares Cloudflare.

Acceptance: a pin gets `'Michelin Guide'` in `lists` only when there's
a high-confidence name+city match. Don't add the tag based on a
fuzzy partial match — the chip will surface the false positive
forever, and rolling back is harder than not adding.

### Phase 3 — Atlas Obscura gap-fill (optional)

Atlas Obscura has a sitemap at
`https://www.atlasobscura.com/sitemap-places.xml.gz` with every place
URL. Slugs are stable. Match by name (normalized) + lat/lng (within
~500m) for the 4,000+ pins without `wikidata_qid`. Confidence bar
should match Phase 2.

Out of scope for v1 if you want to ship Phase 1+2 first — currently
71 Atlas Obscura matches is already useful.

---

## Deliverables expected

1. **A script** at `scripts/backfill-canonical-lists.ts` (or similar)
   that:
   - Reads pins from Supabase via the service-role client.
   - Runs Phase 1 Wikidata SPARQL in batches.
   - Optionally runs Phase 2 Michelin scrape (behind a `--phase=2`
     flag so the cheap pass can run alone).
   - Writes back to `pins.lists` using `array_append`-style updates
     so existing list entries (UNESCO etc.) are preserved.
   - Has `--dry-run` (default) and `--apply`.
   - Logs each match decision with confidence ("matched name + city
     + country", "matched name only — skipped", etc.) so the next
     human reviewer can spot-check.

2. **A one-shot SQL bundle** the user can apply via the Supabase MCP
   (`apply_migration`) if running the script on the user's machine
   is friction. Bundle should be safe to re-run (idempotent — use
   `array_append` with a `NOT (... = ANY(lists))` guard).

3. **A short summary** at the end: how many pins got `Atlas Obscura`
   added, how many got `Michelin Guide`, how many were ambiguous
   and skipped. Format as a markdown table.

4. **Cache bust** after writes: hit
   `POST /api/admin/revalidate-pins` (basic-auth password in env) to
   evict `fetchPinBySlug`/`fetchAllPins`.

---

## Edge cases to handle

- **Closed restaurants**. Michelin does delist places. If a pin's
  `status` is `closed` or `temporarily-closed`, skip Michelin
  matching.
- **Multi-location chains**. A name match in city A doesn't imply
  city B has the same Michelin status. Always anchor to city +
  country.
- **Rename mismatches**. Some pins have stale names (e.g.
  Mike's saved-list import sometimes lost diacritics). When a
  Wikidata QID is set, trust the QID over the local name.
- **Curator-set values**. If a pin already has `'Atlas Obscura'` or
  `'Michelin Guide'` in `lists`, leave it. Bulk runs should be
  additive only — never drop existing list entries.
- **The `Atlas Obscura` lower-case alias issue**. Wikidata sometimes
  returns the property as a slug; always pass the bool `present /
  absent` rather than the slug value into the canonical list write.

---

## Files an agent should read first

1. `lib/pinLists.ts` — canonical set, aliases, normaliseLists,
   getListUrl. Don't add new canonical names without reading the
   header comment about why the set is intentionally small.
2. `lib/pins.ts` — Pin type + INDEX_COLUMNS + cache key conventions.
3. `lib/supabaseAdmin.ts` — service-role client pattern.
4. `scripts/enrich-pins-from-places.ts` — closest existing
   precedent for an enrichment script (reads pins, calls external
   service, writes patches). Same shape works here.
5. `app/api/admin/revalidate-pins/route.ts` — cache-bust endpoint.
6. The migration files (search the repo for `ALTER TABLE pins`)
   to confirm the column type and indexes on `lists`.

---

## DB access

- **Project ID**: `pdjrvlhepiwkshxerkpz`
- **Service-role key**: in `.env.local` as
  `STRAY_SUPABASE_SERVICE_ROLE_KEY` (used by `lib/supabaseAdmin.ts`).
- **Anon URL**: `https://pdjrvlhepiwkshxerkpz.supabase.co`.
- **MCP**: if running through Claude Code or Codex with the Supabase
  MCP installed, use `apply_migration` for DDL and `execute_sql` for
  read queries / one-off writes.

After the run, verify:

```sql
SELECT
  COUNT(*) FILTER (WHERE 'Atlas Obscura'  = ANY(lists)) AS atlas_after,
  COUNT(*) FILTER (WHERE 'Michelin Guide' = ANY(lists)) AS michelin_after
FROM pins;
```

---

## Out of scope (for this handoff)

- Adding a `michelin_stars` or `michelin_recognition` typed column.
  Could be a Phase 4 follow-up; today the goal is just membership.
- Cross-linking the canonical badge to the actual Michelin
  restaurant page. `getListUrl('Michelin Guide', ctx)` currently
  returns `https://guide.michelin.com/` as a fallback; deeplinking
  needs a per-pin slug we don't yet capture.
- Touching any pin where `wikidata_qid IS NULL` AND
  `kind != 'restaurant'`. Those won't be on Atlas Obscura via P3134
  and won't be on Michelin. Skip cleanly.
