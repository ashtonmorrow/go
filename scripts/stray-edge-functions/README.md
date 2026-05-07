# Stray edge functions used by go.mike-lee.me

Source for Supabase edge functions that live in the Stray project (the Postgres
+ edge-function home for both Stray and the travel atlas). They live in this
repo for ergonomics — the Next app calls them via `supabaseAdmin().functions
.invoke(...)` — but they deploy from the Stray repo so the Gemini API key,
edge-runtime env, and CLI auth all stay there.

## generate-stay-review

Wraps a Gemini call. Accepts `{ system_prompt, user_prompt }` and returns
`{ review, model }`. Used by `/api/admin/hotel-stays/generate-review` in this
repo to turn a hotel-stay's Q&A notes into a short review in Mike's voice.

### Deploy

Copy `generate-stay-review/index.ts` to `supabase/functions/generate-stay-review
/index.ts` in the Stray repo, then from that repo:

    supabase functions deploy generate-stay-review

The edge env in Stray already holds `GEMINI_API_KEY` (parse-reservation uses
it). No new secrets needed.

### Verify

After deploy, hit it from this repo's admin:

1. Open `/admin/pins/<some-hotel-pin-id>/stays/new`
2. Save a stay (no notes required)
3. Click "Generate from notes" on the saved stay's edit page
4. The textarea should populate with a short paragraph

If the call returns 502 with "GEMINI_API_KEY not set in edge env", the
secret hasn't propagated to the new function — set it explicitly with
`supabase secrets set GEMINI_API_KEY=<value>` from the Stray repo and
redeploy.
