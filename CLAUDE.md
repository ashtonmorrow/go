# go.mike-lee.me

Mike Lee's personal travel atlas. Three objects: **Cities**, **Countries**, **Pins** (curated travel attractions). Each has Cards / Map / Table / Stats views.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript strict
- **Tailwind CSS v3** with custom design tokens (no shadcn — read `lib/colors.ts`)
- **Supabase Postgres** is the source of truth for cities, countries, and pins. The Postgres instance happens to live in a project named "Stray" (`pdjrvlhepiwkshxerkpz`) — that's a separate Mike Lee product (a cat app at stray.tips) just sharing the database. Treat it as infrastructure: the data is travel atlas content, not cats.
- `lib/notion.ts` is legacy-named for import stability; city + country reads come from `go_cities` and `go_countries`. Notion is still used only for legacy page blocks where local content files do not exist yet.
- **MapLibre GL + react-map-gl** for the globes
- Hosted on **Vercel**. ISR with `revalidate = 604800` (7 days) on every page.

## Commands

```bash
npm run dev        # localhost:3030
npm run build      # production build
npx tsc --noEmit   # typecheck (preferred over npm test for now)
```

## Working in this repo

- Edits go in `app/`, `components/`, `lib/`. Each file has a header comment explaining its job — read those first.
- **Always run `npx tsc --noEmit`** after changes. Typecheck is the only test gate.
- `revalidate` on a page route must be a **literal integer** (not `60 * 60 * 24 * 7`) — Next's segment-config parser rejects BinaryExpressions and the build fails on Vercel.
- Color values in MapLibre paint expressions and inline SVG must come from `lib/colors.ts` (hex constants), not Tailwind classes — the JIT can drop dynamically-built class names.
- Filter state lives in three contexts: `CityFiltersContext`, `CountryFiltersContext`, `PinFiltersContext`. Defaults: status focus null, all faceted sets empty, except cities default to `hasSavedPlaces: 'with'` (lands on curated subset).
- Don't bypass RLS — the public Supabase anon key is the only key shipped to the browser.

## Editorial voice

When writing travel, city, country, arts, music, literature, or cultural copy for this project, use Mike's editorial guidelines:

- Write as a travel writer for readers interested in classical music, opera, composition, performance, musicology, literature, and the broader arts.
- Choose the form that fits the request: itineraries, guides, program notes, essays, reviews, liner notes, profiles, educational articles, lecture notes, festival copy, synopses, or other cultural formats. Do not force a single template.
- Tone: serious, factual, precise, elegant without ornament, clear and literal when explanation is needed.
- Use complete sentences. Prefer plain language over institutional jargon, specificity over abstraction, and direct interpretation over inflated praise.
- Avoid unsupported superlatives, cliches, idioms, boilerplate, and empty prestige language.
- Do not use em dashes.
- Avoid vague adjectives such as profound, timeless, luminous, masterful, haunting, rich, or iconic unless analysis directly supports them.
- Structure each piece around the reader's real question. Use specific H2/H3 headings when helpful, not generic headings such as Overview, Key Takeaways, or Conclusion unless they truly fit.
- Keep paragraphs cohesive. Use transitions so the work reads as an argument, interpretation, or account rather than disconnected notes.
- In critical writing, support judgments with observation. Distinguish description, interpretation, and evaluation.
- In educational writing, explain concepts clearly without flattening the subject.
- In program/catalog writing, help the reader listen, look, or read with more attention. Do not overpraise.
- In reviews and profiles, maintain critical independence and describe artistic choices precisely.
- Put related works, composers, writers, artists, periods, or traditions into the body where they help the reader. If useful, end with a short reader-facing Further Reading, Further Listening, or Related Works section.
- Before finalizing, check: no em dashes; no unsupported superlatives; no unnecessary repetition; clear structure; specific headings; complete sentences; literal phrasing where explanation matters; evidence for interpretive claims; reader-focused organization; publish-ready output.

## Out of scope for this project

This repo is **not** Stray. Don't add cat features, Lovable tooling, Vite, or Capacitor. If a CLAUDE.md elsewhere on your filesystem talks about React+Vite+Lovable cat colonies, that's a different repo entirely — ignore it for this project.
