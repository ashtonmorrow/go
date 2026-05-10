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

## City / list / pin guides — authoring standards

The published travel guides live in `/content/lists/<slug>.md` (the long-form Cape Town / Madrid / Bristol / Bangkok format) and `/content/{cities,countries,pins}/<slug>.md` (shorter prose attached to a detail page). Every new guide must follow the rules below before `indexable: true` is flipped.

**Cross-linking.** Every place name that has a pin or city/country page in the atlas must link to its detail page on first body mention.

- First mention of the city itself: `[Madrid](/cities/madrid)` in the opener.
- First mention of any pinned place: `[El Rastro](/pins/el-rastro)`.
- Subsequent mentions of the same place are plain text. The rule is "first mention only," not "every mention." Don't relink the same place twenty times.
- Areas, neighborhoods, and streets that are not pins (Sukhumvit, Stokes Croft, College Green, La Latina) stay as plain text. Don't invent links.
- When a referenced place lacks a pin, mention it in the body as text and flag it in the file's authoring-notes block as a pin to create. Once the pin exists, swap the text for the link.
- Apply this same rule to guide_cards bodies, FAQ answers, and table cells where it reads naturally. Frontmatter `title` and `description` are summary surfaces and stay plain text.

**Tables for booking-intent and itinerary content.** Where-to-stay should be a table (Hotel | Why it works | Trade-off). Anything you would skip should be its own table in a separate "Hotels I would definitely avoid" section, not mixed into the recommended list. Self-guided walking tours (Banksy in Bristol, the BTS mall walk in Bangkok) work as numbered tables with at least Where, Wikipedia outlink, and Google Maps link columns.

**Local slang.** If a name is local-friend slang ("the Bearpit" for the St James Barton roundabout area), don't lean on it. A first-time visitor will not recognize it. Use the standard name and, if the slang adds color, mention it once with light context.

**Spelling.** British places use British English (centre, harbour, neighbourhood). American places use American spelling. Pages are about the destination, not the writer.

**Em dashes.** None. Use commas, colons, semicolons, periods, or parentheses. The "no em dashes" rule from the editorial-voice section applies to every guide.

**YAML colon-space hazard.** Inside YAML scalar bodies (FAQ `a:` values, guide-card `body:` and `intro:` values, the `description:` field), a literal colon-space sequence (`: `) breaks gray-matter parse and the build will fail. Don't write `"The catch: you must reserve"` as an unquoted YAML value. Rewrite to `"The catch is that you must reserve"`, swap the colon for a semicolon or period, or wrap the whole value in double quotes. Caught Amsterdam once on the first deploy; check before flipping a new scaffold to indexable.

**Featured vs indexable.** Two boolean flags on list frontmatter, decoupled. `featured: true` puts the list on the home-page guides feed. `indexable: true` lets Google index it. Use featured to surface a scaffolded guide on the home before its writeup is polished; flip indexable only after the editorial review. Reference utilities (Alicante tram-stop index, Kusttram station guide, Balkan green markets) are indexable but not featured.

**Authoring-notes block.** Every list/city scaffold ends with an HTML-comment block (`# Authoring notes (kept here, not rendered): ...`) inside the closing frontmatter fence. Use it for: pins still to create, soi/address numbers to verify, follow-up cross-links, why a particular pin is linked instead of a more obvious candidate. These notes don't render; they're how Mike picks up the trail when he comes back to edit.

**Indexable gate.** New scaffolds ship with `indexable: false` until Mike reviews voice, facts, and the hero image. Page metadata is gated on `indexable: true` in the page's own metadata generator (see `/cities/[slug]/page.tsx` and the lists equivalent), and the sitemap reads the same flag. Don't flip indexable in a scaffolder commit.

## Out of scope for this project

This repo is **not** Stray. Don't add cat features, Lovable tooling, Vite, or Capacitor. If a CLAUDE.md elsewhere on your filesystem talks about React+Vite+Lovable cat colonies, that's a different repo entirely — ignore it for this project.
