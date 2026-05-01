# Saved-list import — final apply

The Google Takeout `Saved/<list>.csv` files (230 lists, ~3,023 unique
places) have been collapsed into 10 SQL batches in this directory:

- `update-0.sql` … `update-4.sql` — match the title against existing
  pins by normalized name, append the list memberships to
  `pins.saved_lists`, and copy the CSV note into `pins.personal_notes`
  when the column is empty.
- `insert-0.sql` … `insert-4.sql` — insert a draft pin (no coords) for
  every saved-list title that didn't match an existing pin. Inserted
  rows carry `source = 'google-saved-list'` and `visited = false`.

The first smoke test (`update-4.sql`) ran cleanly via the Supabase MCP
during the prep phase — Massa Bistro, InterContinental Istanbul, and
Travertines of Pamukkale picked up their `istanbul` / `pamukkale`
list memberships. The remaining 9 batches were too large to dispatch
without burning conversation context, so they live here for you to
apply.

## How to run

### Option A — Supabase Studio SQL Editor

Open https://supabase.com/dashboard/project/pdjrvlhepiwkshxerkpz/sql,
paste each file in order (updates first, then inserts), and Run.

Order matters: do all five `update-*.sql` files first so list memberships
land on existing pins. Then the `insert-*.sql` files only insert pins
that **don't already match** by normalized name (the `WHERE NOT EXISTS`
clause), so running them after updates is correct and idempotent.

### Option B — psql

If you have the Postgres connection string from Supabase
(`Settings → Database → Connection string → URI`):

```sh
export DATABASE_URL='postgresql://postgres:<password>@db.pdjrvlhepiwkshxerkpz.supabase.co:5432/postgres'

for f in scripts/saved-list-batches/update-*.sql; do
  echo "=== $f ==="
  psql "$DATABASE_URL" -f "$f"
done
for f in scripts/saved-list-batches/insert-*.sql; do
  echo "=== $f ==="
  psql "$DATABASE_URL" -f "$f"
done
```

Each batch is idempotent — re-running has no effect once applied.

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
