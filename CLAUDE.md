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

**Spelling.** American English throughout, regardless of destination. The destination's own name keeps its own spelling (Britain stays Britain, "centre" stays "centre" inside a quoted English street name). But the prose voice is American: "neighborhood", "favorite", "traveler", "center", "color". The earlier rule that European destinations used British English was an over-application that read as machine compliance; Mike's actual published writing is American.

**Spelling sweeps must not rewrite link slugs.** Pin / city / country / list slugs are the source of truth and were authored with the spelling they have. A mechanical `centre → center` sweep across `/content/lists/*.md` will rewrite both `Bristol City Centre` (link text — should change) AND `/pins/bristol-city-centre` (link slug — must not change, the pin slug never moved). The slug rewrite produces 404 cross-links. Solution: scope spelling sweeps to display text only, e.g. negative-lookbehind on `/pins/`, `/cities/`, `/countries/`, `/lists/`. The `scripts/find-orphan-pin-links.ts` audit will catch any that slip through.

**Em dashes.** None. Use commas, colons, semicolons, periods, or parentheses. The "no em dashes" rule from the editorial-voice section applies to every guide.

**YAML colon-space hazard.** Inside YAML scalar bodies (FAQ `a:` values, guide-card `body:` and `intro:` values, the `description:` field), a literal colon-space sequence (`: `) breaks gray-matter parse and the build will fail. Don't write `"The catch: you must reserve"` as an unquoted YAML value. Rewrite to `"The catch is that you must reserve"`, swap the colon for a semicolon or period, or wrap the whole value in double quotes. Caught Amsterdam once on the first deploy; check before flipping a new scaffold to indexable.

**Featured vs indexable.** Two boolean flags on list frontmatter, decoupled. `featured: true` puts the list on the home-page guides feed. `indexable: true` lets Google index it. Use featured to surface a scaffolded guide on the home before its writeup is polished; flip indexable only after the editorial review. Reference utilities (Alicante tram-stop index, Kusttram station guide, Balkan green markets) are indexable but not featured.

**Section titles for guide_cards.** Don't title the block "How I would use this <City> map." The phrasing reads choppy ("this Madrid map" stutters) and edgy ("how I would" performs personality). Use a flat, neutral heading instead: "Planning <City>" for destination guides, "Using <route>" / "Riding <route>" for transit indexes. The intro paragraph beneath the H2 carries Mike's voice; the H2 itself should read like a normal section heading.

**Authoring-notes block.** Every list/city scaffold ends with an HTML-comment block (`# Authoring notes (kept here, not rendered): ...`) inside the closing frontmatter fence. Use it for: pins still to create, soi/address numbers to verify, follow-up cross-links, why a particular pin is linked instead of a more obvious candidate. These notes don't render; they're how Mike picks up the trail when he comes back to edit.

**SEO titles and descriptions.** Frontmatter `title` and `description` are the SEO surface: `title` becomes the HTML `<title>` element (browser tab + Google SERP), and `description` becomes the meta description. They are decoupled from `guide_cards.title`, which is the on-page H2 and stays in Mike's voice ("Planning Madrid"). The two are written for different audiences.

For destination guides, the title pattern that tested well against Semrush keyword volumes (May 2026, US database) is `"[City] travel guide: [hook A], [hook B], and [hook C]"` where the hooks reference the highest-volume intents we have content for. The three highest-volume travel intents for every city we have guides for are, in order: `things to do in [city]`, `where to stay in [city]`, `[city] itinerary`. Lead the title with "travel guide" rather than the bare city name to disambiguate from brand collisions — Madrid alone is dominated by Real Madrid football queries, Bristol alone collides with Bristol Bears rugby and Bristol TN, Amsterdam alone collides with Amsterdam Avenue NYC and the Ben Affleck film. The `"[City] travel guide"` modifier solves all of these in one move.

Descriptions sit at 150–160 characters of natural prose that pack the same high-intent modifiers (where to stay, things to do, itinerary) plus 2–3 distinctive proper nouns from the guide so the snippet earns a click against generic competitors. Wrap the value in double quotes inside YAML to avoid the colon-space hazard.

For route or transit indexes (Alicante tram, Kusttram), the system name on its own is too thin and too brand-ambiguous to compete. Use `"[System name]: [doing-verb] [place context]"` instead — `"Kusttram station guide: riding Belgium's coastal tram"` rather than `"Kusttram station guide"`. The geographic context is the searchable handle.

**Indexable gate.** New scaffolds ship with `indexable: false` until Mike reviews voice, facts, and the hero image. Page metadata is gated on `indexable: true` in the page's own metadata generator (see `/cities/[slug]/page.tsx` and the lists equivalent), and the sitemap reads the same flag. Don't flip indexable in a scaffolder commit.

**Every new list .md needs a matching saved_lists row.** This caught us once (May 2026): `/content/lists/penedes.md` shipped without an inserted row, the Barcelona cross-link 404'd because `app/lists/[slug]/page.tsx` resolves through `saved_lists` first (slug exact match → name↔slug fallbacks → pins.saved_lists fallback → notFound). Writing the .md and pushing it is not enough. The new-list-scaffold checklist:

1. Write `/content/lists/<slug>.md` with frontmatter + body.
2. Insert a `saved_lists` row: `{ name: '<slug>', slug: '<slug>', description: '...' }` via the service-role key (lowercase name matches the convention used by sitges/barcelona/cairo/etc., and lets the slug-name fallback land cleanly).
3. After the next `saved-lists-meta` cache cycle (~5 min on prod), the page resolves. Trigger `/api/revalidate?secret=…&path=/lists/<slug>` if you need it faster.

The inverse case (saved_lists row without a .md file) is fine and common — those pages render as bare pin lists. The hazard is only `.md without row`.

Run `scripts/find-orphan-pin-links.ts` after any structural changes that touch slugs or cross-links — it audits every `[Name](/pins/<slug>)` reference in published prose and reports any that don't resolve.

**Topics taxonomy.** Cross-cutting themes (festivals, food, where-to-stay, scams-safety, etc.) are a controlled vocabulary, not free-text tags. The registry in `lib/topics.ts` is the single source of truth. A guide or post opts into a topic with a frontmatter `topics:` array:

```
topics:
  - festivals
  - where-to-stay
```

Only slugs that exist in the `TOPICS` registry are kept — `filterValidTopics` drops anything else at parse time, so the taxonomy cannot sprawl. To use a topic that does not exist yet, add it to the registry first; do not invent frontmatter values. Each topic auto-aggregates every tagged guide and post at `/topics/<slug>`.

A topic hub is `noindex` until its registry entry gets an `intro` paragraph — the same rolling-release rule as guides. Writing the `intro` opens the hub to search and adds it (and the `/topics` index) to the sitemap automatically. Nothing else needs to change. The legacy post field `tags:` is read as a fallback alias for `topics:` but is otherwise retired; new content uses `topics:`.

## Voice for travel guides

Mike has two registers in his writing: the casual private trip-planning notes (date+place+action fragments, dollar amounts and points balances, brand names dropped in directly, mixed-language asides) and the published professional explainer on layer.team (question-as-H2 structure, bold-key-term-then-definition, comparison tables, plain declarative sentences, American spelling, no semicolons, no literary flourishes, no transition crutches). **The travel guides should sit between these two registers**, closer to the layer.team published voice with first-person personal asides surfaced where the lived experience earns them.

The AI-default register I produced before this rule existed was a third register that doesn't match either: literary-magazine travel prose, British spelling, triadic adjective clusters, semicolons everywhere, "the trade-off is" / "the trick is" / "the X register" / "earns the X" transitions, no specific dollar amounts in prose, hedged numbers ("about X km"). That register reads as obviously AI-written. The rules below pull guides toward Mike's actual voice.

**Banned phrases and patterns** (these are AI tells; if you find yourself reaching for one, the sentence wants to be rewritten):

- `the X register` — never. Use "the X side", "the X style", "what X cooks", "the X scene", or just name what you mean.
- `the trade-off is` / `the right move is` / `the trick is` / `the move is` — drop. Make the assertion directly. "Stay in Giza if you want a calmer evening" beats "the right move is to stay in Giza."
- `earns the X` / `earns its reputation` / `earns the visit` / `earns the trip` — overused.
- `the headline X` / `the canonical X` — overused.
- `the X postcard` — overused.
- `genuinely`, `honestly`, `frankly`, `broadly`, `generally` as throat-clearing hedges. Drop them. The sentence is better without.
- `These are working notes from real time on the ground rather than a checklist. <Place> rewards going slowly more than it rewards covering ground. Take what's useful, skip the rest.` — banned outright. This was the standardized pace-note paragraph that appeared on 79 of 80 guides, the single biggest AI-tell across the atlas.
- Triadic adjective clusters (`cheap, generous, and surprisingly international` / `quiet, calm, and slower-paced`). One specific adjective beats three vague ones.
- `This is the trip I would book` / `the trip I would take` / `what I would book for someone` / `the version of the trip I would book` — Mike does not write this way. Make the recommendation directly without staging it through a hypothetical-self framing. "Stay in Giza if the pyramids are the reason you came" beats "this is the trip I would book for a first visit focused on the pyramids".
- `worth every penny` / `worth every dollar` / `worth every bit of` — never. Either name a specific reason it is worth the money, or do not make the recommendation.
- `My first pick` / `the right base for me` / `my pick for X` — when describing a hotel or option Mike has used. Mike does not rank his own preferences this way in published writing. State the property, what it gets you, what it does not. The reader decides.
- `the right call` as a closer ("the X is the right call here") — overused as a closing sentence on practical sections. Drop or rewrite specifically.
- `friction` as filler — Mike spotted this as a creeping AI-ism (May 2026 review). It has a legitimate UX-precise sense ("cash-payment friction is real", "the lowest-friction option") that's fine to use sparingly. The lazy use is the abstraction: "the friction is real", "the scams are the friction", "the two friction points to plan around". When you mean "the hustle", "the slow taxis", "the cash push", say that instead. Hard cap: roughly one `friction` per guide.
- `solid` as a quality descriptor — Mike called this out alongside `friction`. "Solid pick", "solid mid-range", "another solid classic", "the food scene is solid" all read as filler. Name what's actually good: "the lamb shoulder is the order", "fair price for the room", "ribbon-cut from the same cured supplier". If you don't have a specific positive, leave the qualifier out and let the pin's presence on the list speak.
- `delivers` / `over-delivers` / `under-delivers` — pure marketing diction. "Rome delivers" is the AI version. "The ancient sights are as good as advertised" is the human version.

**Banned punctuation:**

- **No em dashes** (rule from the editorial-voice section above).
- **No semicolons.** Use periods or commas. Mike's published writing on layer.team has zero semicolons. The semicolon is the AI's preferred connector and reads as overly polished.

**Required positive patterns:**

- **Question-as-H2** structure for practical sections where a reader is asking a real question. `## How do I get from Cairo Airport to Giza?` reads more like the layer.team voice than `## Getting in from the airport.` Use the question form for at least half the H2s in any new guide.
- **Bold-key-term-then-explanation** for practical detail. `**The X95 bus** runs every 30 minutes from Athens airport to Syntagma for €6.` Not `There is a 24-hour bus called the X95 that runs every 30 minutes...`. The bold term is the noun, the rest of the sentence explains it.
- **Comparison tables with side-by-side columns** for any "with X vs without X" or "approach A vs approach B" pattern. Already widely used; keep using them.
- **American spelling** everywhere (see the Spelling section above).
- **Specific dollar amounts and brand names in prose**, not only in tables. `Le Méridien Cairo Airport on 60,000 Marriott points` reads more like Mike's actual writing than `the airport-connected hotel runs at the standard 4-star rate`. Use real numbers, real brand names, real point balances.
- **Plain declarative sentences, mostly short to medium length.** Vary length, but skew shorter than what an AI default produces. Mike's published writing averages about 18-22 words per sentence.
- **First-person where the lived experience genuinely earns it**, not as a default voice. `I came in on a 3 a.m. Lufthansa from Munich and the Uber was the right call.` Yes. `I think Cairo is interesting because...` No, just say it.
- **Practical transitions** that are not the AI defaults. `In practice`, `In most cases`, `When the X is busy`, `If you have only one day`. Not `the trick is`.
- **Self-aware caveats about data skew** are welcome where they apply. Mike's UX-notes voice includes lines like "if you're dropping $150/night on a Marriott in Tirana, it's going to feel like a city in Germany versus the guy who spent $25/night on an Airbnb next door." That kind of caveat earns its place when the recommendation is about category-of-trip.

**Tone for the introduction paragraph:**

The intro to a destination guide should establish what kind of trip the place is and what a reader who has decided to go would want to know. Three to five sentences. Declarative. Concrete. No "rewards going slowly" type framing, no "rewards travelers who show up prepared" type framing. Open with what the city actually is (population, character, geography), then say what shape of trip it suits, then a one-line on what the rest of the guide covers. The "On this page" TOC sits directly after.

**Logistics over narration. No background dumps.**

These are travel guides. The reader is planning a trip and wants to know what to book, where to go, how to get there, what to avoid. They do not want a magazine essay. The single biggest pattern to avoid: explaining a city's history or politics or sociology before getting to the practical advice.

Concrete example. The Barcelona Airbnb section was 4 paragraphs / 262 words explaining the 2010s rental-conversion crisis, the mayor's name, the protest marches, "the shop-window phrase," and the November 2028 phase-out date — before the practical recommendation. Mike's note: "the city is suffering from an affordability crisis and Airbnb is a part of that, many are unlicensed, so a hotel platform is better — is enough." That's the right shape. One sentence of why, one sentence of what to do, one sentence of which alternative.

Rules:

- **The reader has decided to go.** Background is needed only when it changes a booking decision. "Don't book Airbnb here, the licenses are being phased out and bookings get canceled mid-stay" is enough — the reader doesn't need the history of the housing crisis to make that call.
- **Cut every paragraph that starts with "The short version: ... The longer version is the part that matters."** That construction is a flag that a background dump is coming. Either give just the short version, or rewrite so the background is one clause inside the practical sentence.
- **Cut every "the trip falls apart when ..." / "the mistake is treating X like ..." opener.** Replace with the actual rule directly: "Don't drive across the city. Use the BTS and the river."
- **Don't reach for the dramatic explanatory paragraph in the intro.** "If you fly coach often enough, your body will eventually start charging you for it. The slow-burn version is a sore back..." → "Book a thermal-spa city for the arrival night. Soak the next morning. Start the real trip on a body that can carry it." Same idea, one third the words.
- **Cut sentence-of-context openers in sections.** "The pickpocket warnings travelers see in every Barcelona guide are real, and they are the most visible symptom of the same dynamic the rest of this guide is built around." → "The risk is real on La Rambla, Barri Gòtic, and L3."
- **Heuristic: if a paragraph could be deleted entirely and a reader could still book the trip, delete it.** History, etymology, "the city has spent the last several summers visibly pushing back" framing — all candidates.
- **Per-paragraph word budget.** Aim for 25-60 words per paragraph in practical sections. Anything over 100 is almost always a candidate for compression. The high-narrative guides (Split, Rotterdam, Barcelona pre-cleanup) averaged 150-190 words per paragraph; the well-paced ones (Phuket, Bangkok) average 60-80.

**Length and structure:**

A standard city guide runs 1,200 to 2,500 words. Headline city guides (London, Madrid, Bangkok) can go to 4,000. Smaller-destination guides (Trogir, Sitges, Koh Samui) sit at the low end. Most guides have 5-8 H2 sections. The arrival section is always first after the intro. "Where to stay" is almost always second. The remaining sections vary by destination.

**The first-time-visitor survival lens.**

The guide should make a place accessible to someone who has never been there. The reader's question is "How do I see the famous stuff without waiting in line and without getting stuck with a tour guide who knows less than Wikipedia?" Every section should be answerable from that frame.

Concrete checks:
- **Skip-the-line advice is named.** Where the famous attraction has a known booking pattern (Acropolis timed entry, Sagrada Família online tickets, GEM advance booking, Vatican-style queue), the guide says so explicitly. Don't make the reader figure out "are we supposed to book ahead here?"
- **Tour-guide guidance is honest.** Where a guide is worth hiring (Cairo pyramid day, certain archaeology sites), say so. Where Wikipedia + a self-walk is better (most European old-town circuits), say that too. The Cairo guide's "If you're like me and dislike following a guide and would rather read the Wikipedia article and show yourself around" is the right tone.
- **Hours, prices, and access matter.** Opening times, last-admission cutoffs, and whether the ticket is bought at the gate or online belong in the body, not implied.

**Common-scams sections: direct, no paternalism.**

Every guide for a destination with a known scam culture should have a Common-scams section. The voice is direct, names the player and the move, and assumes the reader is an adult.

The shape Mike uses: state what would-be helpful gestures actually are, name the player, name the move, name the response. "No one is going to offer you a free shoe cleaning out of the kindness of their heart. This is a common scam where the shoeshiner drops a brush in your path, picks it up for you, and demands payment for the favor. Walk past." That's the template.

What to avoid:
- **Don't lecture the scammers.** "These people are working a tough tourism economy" is editor framing, not advice. Skip it.
- **Don't lecture the reader.** "Always be careful with your belongings" is condescending and useless. Tell them the specific move instead.
- **Don't soft-pedal with euphemisms.** "Some drivers may try to take advantage" is mush. "The tuk-tuk driver outside the Grand Palace is taking you to a gem shop, not a temple" is information.
- **Name the geographic boundary.** "The risk is real on La Rambla, Barri Gòtic, and L3 between Plaça Catalunya and Drassanes" beats "Be aware in tourist areas." Specifics let the reader spend less effort.

The Cairo `## Common Giza scams and how to handle them` and the new Bangkok `## Common scams around the temples` are the worked examples to match.

**No editor-detour paragraphs.**

A "quick disambiguation" paragraph explaining that the city has two things with the same name is editor brain, not reader brain. If the disambiguation matters, fold it into the first sentence where the ambiguity comes up. Example: don't lead a guide with "La Rambla is the famous boulevard. Rambla del Poblenou is a different street." Instead, when the prose first references the Poblenou Rambla, write `Rambla del Poblenou (the local Rambla in Poblenou, not La Rambla in the center)`. Pay the cost where the reader actually needs the information.

Same rule for "the city is the name of two things at once" intros, "a note on the word X before we go further" preambles, and any paragraph that starts with "Quick disambiguation" / "To keep them straight" / "Worth naming up front."

**Voice check before flipping indexable:**

Before a guide goes `indexable: true`, scan for the banned phrases above. The fastest check: search the file for "register", "trade-off is", "trick is", "right move is", "earns the", "genuinely", "honestly", "frankly", semicolons, "Quick disambiguation", "is the name of two", "to keep them straight", "delivers", "over-delivers", and the lazy-`solid` patterns (`is solid`, `are solid`, `solid pick`, `solid choice`, `solid option`, `another solid`). For `friction`, count instances per guide. One or two with a precise UX sense is fine. Three or more is the AI-ism creeping back in. If any hit, the sentence wants a rewrite.

## Out of scope for this project

This repo is **not** Stray. Don't add cat features, Lovable tooling, Vite, or Capacitor. If a CLAUDE.md elsewhere on your filesystem talks about React+Vite+Lovable cat colonies, that's a different repo entirely — ignore it for this project.
