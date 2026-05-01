# Saved-list import — final apply

The Google Takeout `Saved/<list>.csv` files (230 lists, ~3,023 unique
places) are bundled here for one-shot apply.

**Recommended:** run `apply-all-remaining.sql`. It does everything in
one transaction — stages 3,000 entries into a temp table, runs UPDATE
to merge memberships into matched existing pins, then INSERT to create
draft pins for the unmatched ~1,800 titles, then drops the staging.

The 23 entries already smoke-tested (`update-4.sql`'s Istanbul +
Pamukkale + a few NOLA + Random) are excluded from the consolidated
file so it's safe to run after that test pass.

The split `update-{0..4}.sql` / `insert-{0..4}.sql` files are kept
around as fallback if the mega-file is too large for your client.

## How to run

### Option A — Supabase Studio SQL Editor (recommended)

Open https://supabase.com/dashboard/project/pdjrvlhepiwkshxerkpz/sql,
paste the contents of `apply-all-remaining.sql`, and Run. The whole
thing is one transaction; if anything fails, nothing commits.

### Option B — psql

```sh
export DATABASE_URL='postgresql://postgres:<password>@db.pdjrvlhepiwkshxerkpz.supabase.co:5432/postgres'
psql "$DATABASE_URL" -f scripts/saved-list-batches/apply-all-remaining.sql
```

The `apply-all-remaining.sql` file already excludes the 23 entries
applied during the smoke test, so re-running it is safe (the
`WHERE NOT EXISTS` clause + array-merge dedup handle idempotency).

### Option C (fallback) — split batches

If the consolidated 261 KB file is too large for your tool, run the
split files in order: all five `update-*.sql` first, then the five
`insert-*.sql`. Same idempotent semantics.

## What you'll see after

- **Existing pins** that appear on a saved list will gain `saved_lists`
  entries. Filtering pins by `saved_lists` (e.g. `'madrid'`) shows
  everything in Mike's Madrid lists.
- **New pin candidates** (~1,500–2,000 expected) will appear with
  `source = 'google-saved-list'`, no coords, no slug. They're admin-only
  candidates until you triage them — coords + slug + kind classification
  needs a manual or geocoded follow-up pass.

## Counts

The smoke test confirmed the matching predicate works (3/23 in batch 4).
After full apply, expect the `saved_lists` column to be populated on
roughly 600–900 existing pins and ~1,800 new draft pins to land.
