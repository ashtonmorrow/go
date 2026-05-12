# Backlog

Things to come back to.

## Recently shipped (this session)

- [x] About / Privacy / Credits rewritten in editorial voice — about explains the four sources I cross-reference (Google Maps saved lists, Atlas Obscura history, UNESCO list, Michelin Guide); privacy walks through what GA / Vercel / Supabase actually collect and what I don't do; credits adds Atlas Obscura, UNESCO, Michelin Guide, Google Places, Open-Meteo, AI cover art. All with internal /cities/<slug> crosslinks where places are named.
- [x] Per-route OG image variants for `/pins/[slug]`, `/cities/[slug]`, `/countries/[slug]`, `/lists/[slug]` (next/og ImageResponse, paper/sand/ink-deep/teal palette inline)
- [x] `/cities/[slug]/things-to-do` long-tail landing page with same anchoring rule as parent, indexable only when at least 4 pins exist, sitemap entry per been/go city, cross-link from parent
- [x] City-page season columns (Summer / Winter under "When to avoid") promoted from text-slate to text-ink so the body color matches the paragraph above and the columns read as continuations of the section's argument
- [x] `scripts/audit-thin-pin-descriptions.ts` — emits `scripts/output/thin-pin-descriptions.json` ranked by traffic priority (visited + on a list first), ready to feed into Codex enrichment
- [x] `/about` AboutPage JSON-LD references sitewide AUTHOR_ID via `@id` (entity reconciliation)
- [x] Wikipedia attribution footer on `/pins/[slug]`, `/cities/[slug]`, `/countries/[slug]` (CC BY-SA 4.0 compliance)
- [x] FAQPage schema on `/pins/[slug]` — auto-generated from hours / price / booking / dress code / guide / wheelchair / kid-friendly / duration when ≥2 fields populated
- [x] Sitewide default OG image via `app/opengraph-image.tsx` (next/og) — replaces favicon-as-social-card on cockpit indexes
- [x] `productionBrowserSourceMaps: true` in next.config (PSI Best Practices)
- [x] Person `sameAs` binds Layer author bio + sibling subdomains (ski, pounce, stray)
- [x] `/lists/[slug]` default noindex,follow unless `.md` says `indexable: true`
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

- [ ] **OG images with hero photographs.** The current per-route variants are clean text cards. The next upgrade is to fetch the pin's cover photo (or city personal photo) and composite it as a background panel under the title. ImageResponse supports remote images via `<img src=...>` inside the JSX. Higher share-preview impact, more renderer cost.

- [ ] **Per-country `/countries/[slug]/things-to-do`** landing pages. Same long-tail logic as the city version, but the design call is harder: a country-wide "things to do" lands awkwardly when readers actually plan around a city. Maybe the country version surfaces the cities (with inline pin counts) rather than pins. Defer until the city version has run for a quarter and we can see if Google ranks it.

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

## Content audit — destination guides (May 2026)

Five parallel agents cross-checked every list/destination guide. Findings below are the work queue before any `indexable: true` flip on a new scaffold. Source URLs preserved in agent transcripts.

### Priority 0 — facts wrong enough to block indexable

- [ ] **athens.md** — the Acropolis combo ticket was **discontinued April 2025**. The whole "Acropolis pass" section is built around something that no longer exists. Single-site Acropolis is €30 (high) / €15 (low). National Archaeological Museum is **€20 as of Jan 2026** (file says €12). Daphni Monastery is **free**. Aegina ferry round-trip is closer to €20-€25 conventional (file says €15). Combo claim for Daphni / Hosios Loukas / Nea Moni is wrong — they share a UNESCO inscription, not a ticket. Section needs a rewrite, not a patch.
- [ ] **barcelona.md** — multiple geographic errors. Grand Hyatt is in **Pedralbes** (L3 Maria Cristina), not Diagonal Mar / L4. Four Points by Sheraton Diagonal is in **Poblenou/Glòries**, not "around La Rambla." Durlet Beach Apartments is on **Rambla del Poblenou** (a different Rambla), not the end of La Rambla. Hyatt Regency Tower is in L'Hospitalet and the "walk to airport" claim is wrong (5 km industrial). Sagrada Família is on **L2 (purple) and L5 (blue)**, not L1. T-Casual is **virtual-only via T-Mobilitat NFC** in 2026, not a paper card. L9 Sud requires the **€5.90 Bitllet Aeroport** (T-Casual not valid). Aerobús (~€7.75) is omitted entirely. €30 taxi quote is below the current ~€39 fixed rate. Sitges by Rodalies is 35-38 min, not 45. Renaissance Fira: vertical garden, not "hanging gardens."
- [ ] **rotterdam.md** — Kinderdijk Waterbus Line 202 **does not exist in 2026**. Rebranded as WaterShuttle (Fri/Sat/Sun only, €9.75 single / €19.50 return, no OVpay). Body, FAQ, and table all carry the stale claim. Depot Boijmans is **€20**, not €23. Erasmusbrug pin link points to `/cities/rotterdam` (broken). Witte Huis is "Europe's first high-rise," not "first skyscraper."
- [ ] **khao-yai.md** — park hours are **08:00-17:00**, not 06:00-18:00 (wrong twice, body + FAQ). Haew Narok is **150 m**, not 80 m. **Pha Diao Dai closes annually June 1 - Sep 30** — missing from writeup. Park entry fee is 400 THB for foreign adults (the "400 to 500" range needs a source).

### Priority 1 — material factual errors

- [ ] **alicante.md** — ALC is Spain's **5th-busiest** airport (18.3M pax), not 3rd. "More sunshine than any continental European **capital**" — Alicante is not a capital, should be "city."
- [ ] **the-hague.md** — Mauritshuis €4-after-4pm is **Netherlands residents only** in 2026 (body + FAQ). Queen Emma is Willem-Alexander's **great-great-grandmother** (4 generations), not great-grandmother. Binnenhof "world's oldest parliament still in use" overstates; should be "one of the oldest." Strandhuisjes Kijkduin are seasonal rentals, not "rebuilt every summer." Tsar Nicholas II at Hotel Des Indes — verify; the documented guest list is Pavlova / Empress Sisi / Roosevelt / Mata Hari.
- [ ] **london.md** — Sky Garden is on the **43rd floor** (bars on 35-37), not "35th floor." citizenM Tower of London: **2 lines** (Circle + District), not 3 — DLR's Tower Gateway is a 4-min walk away. Crowne Plaza Docklands: Jubilee Line **requires a transfer at Canning Town** — nearest direct is Elizabeth (Custom House) and DLR (Royal Victoria). Heathrow Express walk-up is £25/£32, not £25-£37.
- [ ] **split.md** — Bus 37 to Trogir: **50-60 minutes** (file says 30), fare ~€2.50 (file says €4). "Pleso Prijevoz" is a **Zagreb** operator name — Split airport bus is Promet Split. Temple of Jupiter is **adjacent to Peristyle** (1-min walk), not "5-min walk north." St. Martin's Church is **5th-6th century**, not 7th. Marjan Hill and Trogir links both point to `/cities/split` (self-link broken; Trogir should be `/cities/trogir`).
- [ ] **trogir.md** — Split Airport (SPU) is **4 km** from the old town, not "a few hundred metres." Body H2 case inconsistent ("A Half-Day Shape" vs "A morning in the old town").
- [ ] **cabo-verde.md** — North American route is **Providence, RI (PVD)** since 2024, not Boston (TACV Boston suspended). Chã das Caldeiras population is ~700-1,000, not "around 1,500." Distance to Senegal is ~570 km, not 450 km.
- [ ] **djerba.md** — DJE airport is **southwest** of Houmt Souk (Mellita), not southeast. Mainland from Djerba is **15-20 min** Ajim-Jorf ferry OR the El Kantara causeway (no ferry); the "90-minute ferry" claim is wrong. Djerbahood: **150 artists / 30+ countries / 250+ murals** — guide_card says "250+ artists" (swap).
- [ ] **santiago-chile.md** — Bip! card is **required** for the metro (single-use paper tickets aren't standard); file frames it as a discount. La Chascona is **8,000 CLP** (~$10), not 7,500. Mercado Central roof is **cast-iron** (Glasgow-built 1872), not "wrought-iron." Concha y Toro pricing is stale (premium tours run $80-128).
- [ ] **montevideo.md** — Colonia del Sacramento link points to `/cities/montevideo` (broken). FAQ frontmatter has a duplicate `a_text:` field that shouldn't be there (stale schema artifact).
- [ ] **kuala-lumpur.md** — KLIA Ekspres runs every **20 minutes** (file says 15-20). **Kelana Jaya is LRT, not MRT** (the MRT lines are Kajang and Putrajaya). **Dark Cave at Batu Caves closed since 2019** — should not be listed as a current add-on.
- [ ] **ho-chi-minh-city.md** — e-visa primary URL is **evisa.gov.vn**, not the older evisa.xuatnhapcanh.gov.vn (both work but the new one is authoritative). Vinpearl Landmark 81 is in **Binh Thanh**, not District 1 (card body misstates; the body table notes the Binh Thanh location correctly). 90-day multi-entry e-visa is $50 (add the price). Pin slug typo: `war-remnants-musem` (missing "u"). Pin `ben-dinh-tunnels` mismatches body text "Cu Chi Tunnels" — disambiguate Ben Dinh vs Ben Duoc.
- [ ] **chiang-mai.md** — **Thai Smile no longer operates** (reabsorbed into Thai Airways early 2024). Cannabis legal status: reclassified as controlled herb mid-2025 — verify framing before indexable.
- [ ] **koh-samui.md** — **There is no Park Hyatt on Koh Samui**. The luxury anchors are Six Senses, Vana Belle (Luxury Collection), Kimpton Kitalay Samui, W Koh Samui. Mu Ko Ang Thong departures are from **both Nathon and Bophut** (file says Nathon only). Authoring-notes block missing.
- [ ] **bangkok.md** — Grand Palace closes the gate at 15:30 but **last admission is 15:00**. Bangkok National Museum is ~10-12 min walk from the Grand Palace, not 5.
- [ ] **phuket.md** — Big Buddha row in cultural circuit links to `/pins/paradise-viewpoint` — Paradise Viewpoint is above Paradise Beach (south of Patong), unrelated to Big Buddha. Mismatch; split or rename.
- [ ] **singapore.md** — Changi Airport to City Hall requires **changing at Tanah Merah** (East-West Line / Changi branch). Helix Bridge pin link points to `/cities/singapore` (self-link). "Easiest airport in the world" is the kind of unsupported superlative CLAUDE.md voice rules call out.
- [ ] **gunung-mulu.md** — "Four daily MASwings flights" is from Miri, not from each city; rephrase as "four daily across the three hubs, Miri the most frequent." Spelling "MasWings" → **MASwings** (official cap). Flag in authoring notes: MASwings was **acquired by AirBorneo Jan 2026**, routes transitioning.
- [ ] **kota-kinabalu.md** — Shangri-La's Tanjung Aru rebranded as **Shangri-La Tanjung Aru, Kota Kinabalu** (no apostrophe-s). Mount Kinabalu climb permits are no longer Sutera Sanctuary Lodges only; the booking concession changed.
- [ ] **bruges.md** — Brussels-to-Bruges single is **€17.60** (and 50% off on weekends with the Weekendticket), not €17/€33-day-return. Antwerp-to-Bruges direct exists at ~75 min.
- [ ] **amsterdam.md** — Schiphol is **9-10 km SW** of Centraal, not 15 km. Zaanse Schans walk is **15 min** across the Julianabrug, not 10. "Spoor" (line 28) is the Dutch word for track/platform, not a place name — lowercase or rephrase.

### Priority 2 — structural

- [ ] **bruges.md** — no where-to-stay table. Only destination guide without one (CLAUDE.md says where-to-stay should be a table). Hotels named in FAQ but never tabulated: The Pand Hotel, Hotel Dukes' Palace, Hotel Heritage.
- [ ] **alicante.md** — where-to-stay is prose, not a table. Convert to Hotel | Why it works | Trade-off.
- [ ] **kusttram-stations.md** — title says "station guide" but body has drifted into a broader beach-culture / how-to-ride guide. Either retitle ("Belgian coast and the Kusttram") or move beach-culture sections to a separate `/lists/belgian-coast` piece.
- [ ] **the-hague.md** — title pattern doesn't match the tested SEO pattern (`"[City] travel guide: [hook A], [hook B], and [hook C]"`); current "36 hours in The Hague" underperforms the high-volume intents (things to do, where to stay, itinerary).
- [ ] **the-hague.md** — many restaurant names in the eat section are unlinked: voco, Hotel Des Indes, Staybridge Suites, De Basiliek, Little V, Baladi Manouche, De Bakkerswinkel, Bouzy, Ciao Ciao, Boterwaag, Lola Bikes &amp; Coffee, Habana Beach, Panorama Mesdag, Voorlinden, Strandhuisjes, Royal Delft, Nieuwe Kerk, Vermeer Centre. Either create pins or flag in authoring notes.
- [ ] **koh-samui.md** and **ho-chi-minh-city.md** — authoring-notes blocks missing. CLAUDE.md requires one on every list scaffold.
- [ ] **cordoba-ar.md** — no "On this page" anchor list. Inconsistent with other scaffolds.
- [ ] **trogir.md**, **balkan-green-markets.md**, **kusttram-stations.md** — body H2 title-case vs sentence-case inconsistency (e.g., "A Half-Day Shape" vs "A morning in the old town").
- [ ] **kuala-lumpur.md** — Sheraton "skip" row mixed into the recommended where-to-stay table. CLAUDE.md: avoid-hotels go in their own "Hotels I would definitely avoid" section.
- [ ] **split.md** — same issue: "Inside the palace" and "Mall of Split / suburbs" rows warn-to-avoid inside the recommended table.
- [ ] **alicante-metro-stops.md** — stretches table mixes L1 (limited stops to Benidorm) with L3 (all stops through Coveta Fumà / Cala Piteres). Add a "Line" column or split the table.

### Pin-link cleanup (separate audit pass)

- Slug typo: `war-remnants-musem` → `war-remnants-museum` (Vietnam) — verify in Supabase and rename or update body.
- Mismatch: `ben-dinh-tunnels` in body labeled "Cu Chi Tunnels" — rename pin or split into Ben Dinh + Ben Duoc.
- `/pins/anchor-bankside` and `/pins/tate-modern` referenced (recently delinked from london.md); decide whether to create those pins or leave plain text.
- Self-links to fix: split.md (Marjan Hill, Trogir row), singapore.md (Helix Bridge), montevideo.md (Colonia del Sacramento), rotterdam.md (Erasmusbrug). All point to `/cities/<self>` and should be pin links or plain text.

### Photos working list

Every new destination scaffold has `hero_image: ""` empty (Cape Town is the only one populated). Highest-impact picks per file:

- **amsterdam.md** — Canal-ring frame at golden hour, or De Gooyer windmill at Brouwerij 't IJ (two pins in one). In-body: Zaanse Schans windmills; Rob Wigboldus herring stand.
- **athens.md** — Acropolis at golden hour from Philopappos or Lycabettus. In-body: Anafiotika whitewashed Cycladic stairs; Cape Sounion sunset.
- **alicante.md** — Castell de Santa Bàrbara at sunset. In-body: Mercat interior; Postiguet or Cala del Moraig.
- **alicante-metro-stops.md** — TRAM crossing the El Campello bridge.
- **bangkok.md** — Wat Arun river-side dusk, or Yaowarat neon street-food angle. In-body: temple-circuit Wat Arun crossing; EmQuartier Helix for the mall walk.
- **balkan-green-markets.md** — Dolac in early morning.
- **barcelona.md** — Sagrada Família exterior or a Poblenou street. In-body: Santa Caterina wave roof; Rambla del Poblenou (to disambiguate); Renaissance Fira vertical garden interior; Sitges old town/beach.
- **bruges.md** — Rozenhoedkaai canal (the universal postcard). In-body: Belfry from Markt; De Halve Maan tasting/rooftop.
- **cabo-verde.md** — Pico do Fogo crater village (Chã das Caldeiras with cone behind). In-body: Mindelo waterfront; volcano cone.
- **cape-town.md** — hero populated. In-body: Boulders penguin colony; Karibu or Heaven Coffee Shop interior.
- **chiang-mai.md** — Doi Suthep gold chedi or Old City moat-and-wall. In-body: Wat Chedi Luang broken stupa; Sunday Walking Street.
- **cordoba-ar.md** — Jesuit Block facade or the Sierras. In-body: La Cumbrecita alpine village.
- **djerba.md** — Djerbahood mural wall. In-body: Houmt Souk fish-market or whitewashed medina; El Ghriba interior.
- **gunung-mulu.md** — Deer Cave entrance with bat exodus, or the Pinnacles. In-body: Pinnacles trek; Marriott open-air bar.
- **ho-chi-minh-city.md** — Motorbike-saturated Pasteur Street, or the Notre-Dame / Post Office colonial pair, or a Heart of Darkness flight closeup. In-body: Pasteur Street alley entrance; Saigon Central Post Office interior.
- **khao-yai.md** — Haew Narok or Haew Suwat shot, or a vineyard-row view (PB Valley / GranMonte). In-body: wildlife (gibbon, salt-lick elephant); Palio piazza to set expectations.
- **koh-samui.md** — Big Buddha gold statue, or Chaweng / Choeng Mon beach. In-body: Wat Plai Laem (18-armed Guanyin); Coco Tam's fire-twirler sunset.
- **kota-kinabalu.md** — Floating Mosque at sunset, or Tanjung Aru sunset over the South China Sea. In-body: Sapi or Manukan beach.
- **kuala-lumpur.md** — Petronas Towers from KLCC Park at dusk. In-body: Batu Caves rainbow steps and Murugan statue; Sentul Depot or Bukit Bintang street art.
- **kusttram-stations.md** — Kusttram in motion along the dyke, or strandcabines in a row. In-body: strandcabines; Oostduinkerke horseback fishermen.
- **london.md** — Sky Garden view across the Thames, or Tower Bridge at sunset. In-body: Tate Modern + Millennium Bridge on the Bankside walk; Canary Wharf skyline.
- **montevideo.md** — Río de la Plata sunset from Punta Carretas, or the Rambla curve. In-body: Mercado del Puerto parrilla.
- **phuket.md** — Kata Noi or Freedom Beach overhead, or Big Buddha from below. In-body: Freedom Beach; Café del Mar or KUDO patio.
- **rotterdam.md** — Erasmusbrug from Kop van Zuid at dusk, or the Markthal painted-ceiling vault. In-body: Cube Houses or Markthal interior; Kinderdijk windmills.
- **santiago-chile.md** — Cerro San Cristóbal Virgin with Andes behind. In-body: Maipo Valley vineyard; Valparaíso colorful hillside murals.
- **singapore.md** — Marina Bay night skyline or Supertree Grove 7:45 show. In-body: Cloud Forest interior or Supertrees; Lau Pa Sat satay street at dusk.
- **split.md** — Diocletian's Palace Peristyle or bell tower from below. In-body: Marjan Hill viewpoint; Hvar/Brač ferry.
- **the-hague.md** — Hofvijver pond with Mauritshuis and Binnenhof reflected (the SEO-snippet shot). In-body: Scheveningen pier or beach huts; Madurodam miniature scale; Mauritshuis Vermeer.
- **trogir.md** — Old town from above (across bridge) or Kamerlengo Castle. In-body: resident cats anecdote.

### Cross-cutting patterns

- Hero images: every new scaffold except cape-town.md is empty. Picker is at `/admin/lists/<slug>`.
- `indexable: true` gate: athens, barcelona, rotterdam, khao-yai have Priority-0 errors and should not flip until those land. Don't flip without a re-read.
- Self-links: when no pin exists, the pattern in some scaffolds is to link to the parent city page; that creates a duplicate-anchor user experience. Either create the pin or leave plain text per CLAUDE.md.
- Unsupported superlatives in voice ("easiest airport in the world," "best craft beer scene in Southeast Asia," "more sunshine than any continental European capital"): CLAUDE.md voice rules call these out. Sweep across files.

## Notes

- Admin password is in Vercel env (`ADMIN_PASSWORD`).
- Service role key is in Vercel env (`STRAY_SUPABASE_SERVICE_ROLE_KEY`).
- Stray Supabase project: `pdjrvlhepiwkshxerkpz`.
- Codex enrichment prompt: `~/Desktop/Stray/codex-pin-traveler-enrichment.md`.
- `/api/revalidate?secret=...&path=/...` busts a specific path's ISR cache + the supabase-* tags.
