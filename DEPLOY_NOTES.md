# Deploy notes & deferred tasks

_Context I want to preserve between sessions._

## Status of this build

The MVP shipped with **no Google Maps integration**. The home page (`/`) is a card grid of Been cities; Cities browser (`/cities`) has filter/sort; city and country detail pages are full. Adding a map view is a deferred task below.

Only env var needed to run: `NOTION_TOKEN`. `REVALIDATE_SECRET` is optional for webhook-based rebuilds.

## Deferred: Google Maps integration (was in MVP, pulled for simplicity)

Removed from the first deploy so the site only needs one secret (Notion token). The components `components/CityMap.tsx` and `app/page.tsx`'s earlier map variant were the starting points; `@vis.gl/react-google-maps` was the library.

**When to come back to this:**
1. Re-add `@vis.gl/react-google-maps` to `package.json`.
2. Create a new Maps JavaScript API key in Google Cloud (keys should NEVER live in this repo — only in `.env.local` and Vercel env vars).
3. Apply HTTP referrer restrictions to the new key (see below).
4. Add a new route, e.g. `/map`, using the existing `CityMap` component pattern.

**HTTP referrer restrictions to apply** when that key is created (Google Cloud → APIs & Services → Credentials → the key → Application restrictions → Websites):

```
localhost
localhost:3000
localhost:3000/*
localhost:8080
localhost:8080/*
127.0.0.1
127.0.0.1:*
127.0.0.1:*/*
go.mike-lee.me
go.mike-lee.me/*
stray.tips
stray.tips/*
app.stray.tips
app.stray.tips/*
*.vercel.app
*.vercel.app/*
```

**API restriction**: pick "Restrict key" and allow only **Maps JavaScript API**.

**Mitigation until restrictions are applied**: set a Google Cloud billing alert (Billing → Budgets & alerts) at $20/month, thresholds 50/90/100.

## Deferred: Map ID (custom map styling)

When bringing maps back, you can style the map (muted colors, less label clutter, "travel journal" vibe):
1. Google Cloud console → Google Maps Platform → Map Management → Create Map ID.
2. Choose **Vector** (required for Advanced Markers + the `@vis.gl` library).
3. Style it in the cloud-based Map Styles editor.
4. Paste the Map ID into `NEXT_PUBLIC_GOOGLE_MAPS_ID` in `.env.local` and in Vercel env vars.

## Deferred: webhook for Notion → site revalidation

Currently pages revalidate hourly via `export const revalidate = 3600` in each route. To make Notion edits appear within seconds:

1. Generate a random string, set it as `REVALIDATE_SECRET` in `.env.local` and Vercel.
2. In n8n, Zapier, or Make: trigger "Notion database item updated" → POST to `https://go.mike-lee.me/api/revalidate?secret=<the-secret>&path=/cities/<slug>`.

## Deferred: slug uniqueness audit

Some cities may have colliding slugs (e.g., multiple "Toledo", "Washington", "Springfield"). Matters because `/cities/[slug]` needs unique URLs. Not yet run. Script idea: group all Cities rows by Slug, flag duplicates, either dedupe or append a country suffix.

## Deferred: 9 cities whose coords were fixed mid-session

Madrid, Cerbère, Luang Prabang, Toledo, Dover, York, Munich, Innsbruck, Wallonia had corrupt lat/long in Notion and were fixed during enrichment. Weather data was re-fetched for all of them. Prose was regenerated for all of them. Nothing to do here — noting only for future debugging if anything looks off on those city pages.

## One-time incident: Google Maps key exposed in a prior commit

The original scaffold included a literal Maps API key in this file. The key was rotated (old one deleted in Google Cloud) and git history was rewritten via force-push before any production use. Rule going forward: NEVER paste literal key values into any committed file — always reference via env var like `${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`.
