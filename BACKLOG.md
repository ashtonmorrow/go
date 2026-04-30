# Backlog

Things to come back to once the data enrichment is further along.

## SEO — after enrichment is mostly done

These are the highest-leverage items once content quality is up.

- [ ] **`noindex` thin pages.** Pin detail pages where `!visited && !personalReview && lists.length === 0 && !hoursDetails && !priceDetails` add no value beyond Wikipedia. Same for cities never been + no curated content. Keep them in the sitemap so they get crawled when content lands. Implementation: a small `isThinPage(pin)` helper, set `robots: { index: false, follow: true }` in the page metadata when true.

- [ ] **Wikipedia attribution footer** on detail-page sections that use Wikipedia summary text or thumbnails. Required by CC BY-SA 4.0. Format: "Text/image from the Wikipedia article *Pyramids of Egypt*, licensed under CC BY-SA 4.0." with a link to the license. Can be small text under the lead paragraph + sidebar thumb.

- [ ] **`SearchAction` on the WebSite schema** so Google can show a sitelinks search box. Add `potentialAction: { @type: 'SearchAction', target: { urlTemplate: ... }, 'query-input': 'required name=search_term_string' }` in `websiteJsonLd()`.

- [ ] **`Article` (or `AboutPage`) schema on `/about`** instead of generic `WebPage`. Wire `author: personJsonLd()`, `datePublished`, `dateModified`.

- [ ] **OG images per page**. Right now indexes use the favicon. Generate or pick a static branded OG image for each index view. Vercel's `next/og` can render dynamic images per pin if we want to go further later.

- [ ] **FAQ schema on populated pin pages**. When a pin has hours, admission, dress code, etc., emit `FAQPage` with auto-generated Q&A like "What time does X close?" / "How much does it cost?" — these win long-tail rankings.

- [ ] **List landing pages**: `/lists/unesco`, `/lists/atlas-obscura`, `/lists/new-7-wonders`. Each is a `CollectionPage` filtered to that list with an editorial intro. Strong long-tail target ("UNESCO sites in Egypt", "Atlas Obscura recommendations").

- [ ] **Per-country, per-city "things to do" landing pages**: `/countries/egypt/things-to-do`, `/cities/cairo/things-to-do` showing the city's pins. Same long-tail logic.

- [ ] **Internal linking: "More near here"** at the bottom of each pin detail page. Top 4 nearest pins (haversine within 5km) as a related block. Boosts crawl depth + topical authority.

- [ ] **Richer page titles for long-tail.** Today: `<pin name>`. Better: `<pin name> — visit guide, hours, tickets · Mike Lee`. Auto-generated based on which fields are populated.

- [ ] **Meta-description quality.** Currently auto-clipped from `description`. For visited pins with a personal review, use the first 155 chars of the review instead — more unique and engaging.

## Per-kind detail page polish

- [ ] **Hotel pages**: hide irrelevant amenity grid items (food_on_site, shade, indoor_outdoor are noise for hotels). Show check-in/checkout times instead. Show "Book this hotel" CTA prominently.

- [ ] **Restaurant pages**: hide most amenity grid items. Show price range estimate. Show "Reserve" CTA when reservation_recommended is true.

- [ ] **Park pages**: keep current attraction-style layout but emphasize season + weather + difficulty.

- [ ] **Transit pages**: dedicated section for connections, schedules, ticket types — completely different shape from attractions. Lower priority since few pins are this kind.

## New features

- [ ] **Hotel reservation upload.** Admin button "Add past stay" → paste a confirmation email or upload a PDF → parse hotel name, dates, nights, room type, price → create or attach to a hotel pin with all fields filled. This is the Mike-can-do-bulk-import-without-typing flow. Probably uses Gemini/Claude vision on the PDF.

- [ ] **Restaurant reservation parser** — same but for OpenTable / Resy emails. Fills `dishes_tried` would still need manual.

- [ ] **Photo-to-place ML**. Beyond GPS, infer place from photo content (Eiffel Tower visible, etc.). Helps when EXIF is stripped or off.

- [ ] **Trip grouping**. Group photos by EXIF date proximity into "trips" so the upload UI shows "Spain, March 2024 — 47 photos, 12 places" rather than a flat list.

- [ ] **Sister/related pins**. When viewing the Pyramids, show the Sphinx, Giza Plateau, Khufu Pyramid as related. Auto-derived from Wikidata `part_of` relationships.

## Data hygiene

- [ ] **Cities admin editor.** Mirror /admin/pins for cities — search/filter/edit per-city. Currently cities only edit through Notion.

- [ ] **Countries admin editor.** Same for countries.

- [ ] **Audit thin descriptions.** Run a query to find pins with descriptions < 100 chars or that look generic. Codex can fill those.

- [ ] **Backfill `kind`** for pins where current heuristic guessed wrong (especially "cultural" → "attraction" — some "cultural" UNESCO entries are actually parks or transit). Spot-check via the admin filter.

## Notes

- Admin password is in Vercel env (`ADMIN_PASSWORD`).
- Service role key is in Vercel env (`STRAY_SUPABASE_SERVICE_ROLE_KEY`).
- Stray Supabase project: `pdjrvlhepiwkshxerkpz`.
- Codex enrichment prompt: `~/Desktop/Stray/codex-pin-traveler-enrichment.md`.
