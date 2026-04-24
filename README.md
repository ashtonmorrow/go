# go.mike-lee.me

An interactive travel atlas — a sibling to [mike-lee.me](https://mike-lee.me) and [ski.mike-lee.me](https://ski.mike-lee.me). Reads from a Notion workspace; deploys to Vercel.

## What's here

- **`/`** — world map of every city tagged Been or Go, with filters and a click-through to each city's page.
- **`/cities`** — tiled grid of every city with search + sort (A–Z, population, hottest, coldest, rainfall, elevation, founded).
- **`/cities/[slug]`** — Wikipedia-style city page: hero photo, facts sidebar, seasonal notes, sister-cities pills, and the Notion page body rendered as blog content underneath.
- **`/countries/[slug]`** — country roll-up with flag, travel logistics (plug, voltage, visa, emergency number), Wikipedia lede, and cities in that country.
- **`/api/revalidate`** — webhook endpoint to rebuild a page on demand when Notion changes.

## Stack

- **Next.js 15** (App Router)
- **Tailwind CSS** — palette matches mike-lee.me (cream / slate / teal)
- **`@notionhq/client`** for reading from Notion
- **`@vis.gl/react-google-maps`** for the Google Maps integration

## First-run setup

You'll need three things: a Notion integration, a Google Maps key, and a place to deploy. This takes ~15 minutes.

### 1. Clone and install

```bash
git clone git@github.com:YOUR_USERNAME/go.git
cd go
npm install
cp .env.example .env.local
```

### 2. Create a Notion integration

1. Go to https://www.notion.so/my-integrations → **New integration** → internal.
2. Copy the Internal Integration Token (starts with `ntn_` or `secret_`). Paste it into `.env.local` as `NOTION_TOKEN`.
3. In Notion, open each of the two databases and click **•••** → **Connections** → add your integration:
   - 🌆 **City Facts** (`2d3fdea3-fd4b-80c8-9bc3-000bb40bd7d2`)
   - 🌍 **Countries** (`d2f2e3c4-9309-4987-96f0-181eb6b135b6`)

If you later rename these DBs, the IDs above in `lib/notion.ts` don't change — they're stable.

### 3. Get a Google Maps API key

1. https://console.cloud.google.com → APIs & Services → Credentials → **Create API key**.
2. Restrict the key by HTTP referrer: add `localhost/*`, `go.mike-lee.me/*`, and your preview URLs.
3. Enable **Maps JavaScript API** under Library.
4. (Optional) In *Map management* create a custom Map ID with your desired styling; paste into `NEXT_PUBLIC_GOOGLE_MAPS_ID`.
5. Paste the key into `.env.local` as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

### 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000.

The first load will cold-fetch ~1,400 cities + 213 countries from Notion (~5 seconds). Subsequent loads hit the cache.

### 5. Deploy to Vercel

```bash
# Push the repo to GitHub first
gh repo create go --private --source=. --push
# Or, if you prefer the web UI, create an empty repo on GitHub and:
git remote add origin git@github.com:YOUR_USERNAME/go.git
git push -u origin main

# Then connect to Vercel:
npx vercel
```

In the Vercel dashboard, add the three env vars (`NOTION_TOKEN`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional `NEXT_PUBLIC_GOOGLE_MAPS_ID`, `REVALIDATE_SECRET`) under **Settings → Environment Variables**.

### 6. Point go.mike-lee.me at Vercel

Since mike-lee.me is on Squarespace, you add a **subdomain CNAME** in Squarespace:

- Host: `go`
- Record type: `CNAME`
- Target: `cname.vercel-dns.com`

Then in Vercel → **Domains**, add `go.mike-lee.me`. Vercel will verify the DNS and issue SSL.

## Keeping the site in sync with Notion

The site is server-rendered with ISR (Incremental Static Regeneration). By default each page re-validates hourly. Two ways to force a fresh rebuild:

1. **Manual**: in Vercel, hit *Redeploy* on latest.
2. **Automatic via webhook**: Notion doesn't emit webhooks natively, so use an intermediary:
   - Set `REVALIDATE_SECRET` in your env to a random string.
   - Use a service like [n8n](https://n8n.io) or [Zapier](https://zapier.com) with a "Notion database changed" trigger that POSTs to `https://go.mike-lee.me/api/revalidate?secret=<your_secret>&path=/cities/<slug>`.
   - Or run a daily cron in Vercel that POSTs the same endpoint.

## Editing Notion → site effect

The app pulls these columns. Renaming a column in Notion will break its fetch until you update `lib/notion.ts`.

**Cities:**
- Title: `Name`
- Rich text: `Slug`, `Local Name`, `Mayor`, `Founded`, `Demonym`, `UTC Offset`, `City Motto`, `Nicknames`, `IATA Airports`, `Wikipedia Summary`, `about`, `Why Visit?`, `avoid`, `Quote`, `Plac`, `hot/dry season name`, `hot/dry season description`, `cold/wet season name`, `Cooler/Wetter Season`, `Time Zone`, `Lat & Long`
- Numbers: `Population`, `Area (km²)`, `Elevation (m)`, `Avg High (°C)`, `Avg Low (°C)`, `Annual Rainfall (mm)`
- Select: `Country`, `Köppen Climate`
- Checkbox: `Been?`, `Go?`
- Files: `Hero Image`, `Personal Photo`
- URL: `Wikipedia URL`, `My Saved Places`
- Relation: `Country (linked)`, `Sister Cities`

**Countries:**
- Title: `Name`
- Rich text: `Slug`, `ISO2`, `ISO3`, `Capital`, `Language`, `Currency`, `Calling Code`, `Voltage`, `Tipping`, `Emergency Number`, `Wikidata ID`, `Wikipedia Summary`
- Multi-select: `Plug Types`
- Select: `Continent`, `Tap Water`, `Visa (US Passport)`
- Checkbox: `Schengen?`
- Files: `Flag`

## What's not in the MVP yet

- Search across city content (ships with name+country search only)
- Blog feed page (/posts) — blog bodies live on city pages for now
- Dark mode
- Photo galleries (per-city gallery beyond single Hero + Personal Photo)
- Trip itineraries / multi-city routes
- Country pages link to their Notion body in a lighter way — need to decide layout
- Per-page Open Graph / social cards
- Sitemap + robots.txt

## Known data caveats

- 21 obscure cities are missing weather data (NASA POWER didn't resolve them).
- Wallonia is in the Cities DB as a "city" but it's actually a Belgian region.
- Köppen codes were derived algorithmically and skew toward `Cfa` — hand-fix any that look wrong.
- UK cities have the Country select "United Kingdom of Great Britain and Northern Ireland" while the country page title is "United Kingdom". Cosmetic only; the relation links to the right country.

## License

Private / personal. Code is yours; the content (photos, writing) is Mike Lee's.
