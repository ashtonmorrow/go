# google_place_url backfill — saved-list URLs

The original saved-list batch generator (`scripts/saved-list-batches/`)
dropped the **URL** column when staging Google Takeout `Saved/<list>.csv`
into the import temp table. As a result, ~2,700 pins from the saved-list
import landed without a `google_place_url`, even though every CSV row
carried one.

This bundle re-reads every list CSV and emits a SQL UPDATE in three
chunks that backfills `pins.google_place_url` for every row whose
normalized name matches an existing pin AND currently has no URL.

## Numbers

- 230 CSV files re-parsed
- 2,408 rows with both Title and URL
- 2,369 distinct normalized names
- 9 names with multiple URLs across lists (longest URL wins as canonical)

Coverage will land north of ~2,000 pins of the 2,706 saved-list pins
currently missing URLs (perfect-match floor; remainder are titles
that didn't survive normalization or weren't in any list CSV).

## How to run

### Option A — Supabase Studio SQL Editor (recommended)

Open https://supabase.com/dashboard/project/pdjrvlhepiwkshxerkpz/sql,
paste each `chunk-NN.sql` file in order, and Run. Each chunk returns
one row: the count of pins it actually updated. The matches are
idempotent (`AND pins.google_place_url IS NULL`) — re-running a chunk
is a no-op.

### Option B — psql

```sh
export DATABASE_URL='postgresql://postgres:<password>@db.pdjrvlhepiwkshxerkpz.supabase.co:5432/postgres'
for f in scripts/url-backfill-batches/chunk-*.sql; do
  echo "=== $f ===" && psql "$DATABASE_URL" -f "$f"
done
```

## Verify after

```sql
-- Coverage delta — was ~2,313 with URL out of 5,090, now expect a big jump.
SELECT
  COUNT(*)                                  AS total,
  COUNT(google_place_url)                   AS with_url,
  COUNT(*) - COUNT(google_place_url)        AS still_missing,
  COUNT(*) FILTER (WHERE source = 'google-saved-list' AND google_place_url IS NULL) AS saved_list_still_missing
FROM pins;
```

## Provenance

The match key is the existing `pins.norm_name` generated column
(diacritic-stripped, lowercased, alphanumeric-only). The Python
helper in `outputs/build-url-backfill.py` mirrors that exact
expression — including the off-by-two bug in the original migration's
`translate()` table — so we round-trip cleanly.

Source CSVs came from a fresh Google Takeout export (Maps → Saved)
delivered May 1, 2026.
