# Backlog

Things to come back to.

## Recently shipped (this session)

- [x] Self-host Inter via next/font; map components on dynamic loaders
- [x] Wikipedia section on `/pins/[slug]` streams via `<Suspense>`
- [x] Typography sweep across pin / city / country / list detail pages
- [x] Detail pages ISR-able by moving `?admin=1` to client-side `<AdminEditLink>`
- [x] List page modular content blocks (`route_map`, `guide_cards`, `faqs`, `related`) declared in `.md` frontmatter; full markdown body rendering
- [x] Codex AI poster falls back to hero on `/pins/[slug]` when no real photo exists
- [x] Backlinked 553 orphaned codex Storage files into `pins.images`
- [x] PSI quick wins: drop legacy polyfills (browserslist), route Wikimedia + OSM images through Next/Image at proper sizes
- [x] Cities-cards + pins-cards aggregators — slim derived payloads cached at lib/ layer (avoids 2 MB cache rejection on raw 2.2 / 7.5 MB corpora)
- [x] gtag.js deferred to `afterInteractive` (1.1 s of blocking off the critical path)
- [x] Google Search Console verification file in `public/`
- [x] Person `sameAs` binds Layer author bio + sibling subdomains (ski, pounce, stray) into the entity
- [x] `/lists/[slug]` default noindex,follow unless `.md` frontmatter `indexable: true`

## Already in code (older work; closing out from earlier backlog)

- [x] `noindex` thin pages — pin / city / country / post / list all gated
- [x] `SearchAction` in `WebSite` schema — sitelinks search box
- [x] "More near here" related pins block on `/pins/[slug]`
- [x] Richer page titles via `pinPageTitle()` — adds `: review, hours, tickets` suffix when fields populated
- [x] Meta-description from `personalReview` (155 char clip) when available
- [x] Hotel-shaped amenity grid hiding + CTAs ("Plan a stay" / "Book a room")
- [x] Restaurant-shaped CTAs ("Plan a meal" / "Reserve a table")
- [x] Cities admin editor (`/admin/cities`)
- [x] Countries admin editor (`/admin/countries`)

## SEO — open

- [ ] **Wikipedia attribution footer** on detail-page sections that use Wikipedia summary text or thumbnails. Required by CC BY-SA 4.0. Format: "Text/image from the Wikipedia article *Pyramids of Egypt*, licensed under CC BY-SA 4.0." with a link to the license. Can be small text under the lead paragraph + sidebar thumb.

- [ ] **`Article` (or `AboutPage`) schema on `/about`** instead of generic `WebPage`. Wire `author: personJsonLd()`, `datePublished`, `dateModified`.

- [ ] **OG images per page**. Right now indexes use the favicon. Generate or pick a static branded OG image for each index view. Vercel's `next/og` can render dynamic images per pin if we want to go further later.

- [ ] **`FAQPage` schema on populated pin pages**. When a pin has hours, admission, dress code, etc., emit auto-generated Q&A like "What time does X close?" / "How much does it cost?" — these win long-tail rankings. Pattern already exists for `/lists/[slug]` (frontmatter `faqs:`); extend to pins.

- [ ] **Per-country / per-city "things to do" landing pages**: `/countries/egypt/things-to-do`, `/cities/cairo/things-to-do` showing the city's pins as a curated feed with editorial intro. Strong long-tail target.

- [ ] **Search Console (user-side)** — click Verify after Vercel deploys, submit `https://go.mike-lee.me/sitemap.xml`. Optionally verify `mike-lee.me` as a Domain property (DNS TXT) so all subdomains roll up under one Search Console view.

## PSI / perf — open

- [ ] **Re-run PSI on `/cities/cards`** after `0dff975` + `306b282` deploy. Quick wins should push 58 → ~75-85.

- [ ] **Bust ISR caches on `/pins/[slug]`** for the 553 newly-linked codex pins so the codex hero renders before the 7-day TTL rolls. POST `/api/revalidate?secret=...&path=/pins/<slug>` per slug, or just `path=/` for a blanket bust.

- [ ] **Extend the small-payload aggregator pattern** to other heavy server-side fetches that PSI's build still warns about: `/cities/stats`, `/cities/map`, `/pins/views/[view]`, `/world`, `/map`, `/lists` index, `/countries/cards`, `/countries/table`. Each currently calls `fetchAllPins` or `fetchAllCities` directly and gets the "items over 2MB can not be cached" warning.

- [ ] **Touch target sizes** (PSI Accessibility) — 89 score; some clickable elements are under 44 × 44 dp.

- [ ] **Background / foreground contrast** (PSI Accessibility) — a few palette pairings flagged. Probably the muted text on cream-soft.

- [ ] **Heading sequence** (PSI Accessibility) — somewhere a heading skips a level. Audit.

- [ ] **Missing source maps for first-party JS** (PSI Best Practices) — set `productionBrowserSourceMaps: true` in next.config.js if we want them.

## Per-kind detail page polish

- [ ] **Park pages**: emphasize season + weather + difficulty over the attraction template.

- [ ] **Transit pages**: dedicated section for connections, schedules, ticket types — different shape from attractions. Lower priority since few pins are this kind.

## New features

- [ ] **Hotel reservation upload.** Admin button "Add past stay" → paste a confirmation email or upload a PDF → parse hotel name, dates, nights, room type, price → create or attach to a hotel pin with all fields filled. Probably uses Gemini/Claude vision on the PDF.

- [ ] **Restaurant reservation parser** — same but for OpenTable / Resy emails.

- [ ] **Photo-to-place ML**. Beyond GPS, infer place from photo content (Eiffel Tower visible, etc.). Helps when EXIF is stripped or off.

- [ ] **Trip grouping**. Group photos by EXIF date proximity into "trips" so the upload UI shows "Spain, March 2024 — 47 photos, 12 places" rather than a flat list.

- [ ] **Sister/related pins** from Wikidata `part_of`. When viewing the Pyramids, show the Sphinx, Giza Plateau, Khufu Pyramid as related. Distinct from the existing geographic "More near here" block.

## Data hygiene

- [ ] **Audit thin descriptions.** Run a query to find pins with descriptions < 100 chars or that look generic. Codex can fill those.

- [ ] **Backfill `kind`** for pins where current heuristic guessed wrong (especially "cultural" → "attraction" — some "cultural" UNESCO entries are actually parks or transit). Spot-check via the admin filter.

- [ ] **12 storage codex orphans**: codex files in `pin-images/<slug>/art-deco-travel-poster.png` for slugs that have no matching pin row (deleted pins, addresses, coord slugs). Either ignore or delete the storage files. Slugs: `22-bradley-cir`, `38-20-50-4-n-0-29-06-4-w`, `39-52-13-4-n-20-00-55-0-e`, `41-19-08-9-n-19-48-54-0-e`, `535-amherst-dr`, `alitrastero-trasteros-en-el-centro-de-alicante`, `amazing-places-to-eat-and-drink-in-houston-and-the-surrounding-areas`, `aparkalekua`, `asboth-u-24`, `aug-02-2019`, `central-sector-of-the-imperial-citadel-of-thang-long-hanoi`, `deligradska-10`.

## Notes

- Admin password is in Vercel env (`ADMIN_PASSWORD`).
- Service role key is in Vercel env (`STRAY_SUPABASE_SERVICE_ROLE_KEY`).
- Stray Supabase project: `pdjrvlhepiwkshxerkpz`.
- Codex enrichment prompt: `~/Desktop/Stray/codex-pin-traveler-enrichment.md`.
- `/api/revalidate?secret=...&path=/...` busts a specific path's ISR cache + the supabase-* tags.
