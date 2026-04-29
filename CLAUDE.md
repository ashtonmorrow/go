# go.mike-lee.me

Mike Lee's personal travel atlas. Three objects: **Cities**, **Countries**, **Pins** (curated travel attractions). Each has Cards / Map / Table / Stats views.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript strict
- **Tailwind CSS v3** with custom design tokens (no shadcn — read `lib/colors.ts`)
- **Notion** is the source of truth for cities + countries (via `lib/notion.ts`, cached with `unstable_cache`)
- **Supabase Postgres** for pins. The Postgres instance happens to live in a project named "Stray" (`pdjrvlhepiwkshxerkpz`) — that's a separate Mike Lee product (a cat app at stray.tips) just sharing the database. Treat it as infrastructure: the data is travel attractions, not cats.
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

## Out of scope for this project

This repo is **not** Stray. Don't add cat features, Lovable tooling, Vite, or Capacitor. If a CLAUDE.md elsewhere on your filesystem talks about React+Vite+Lovable cat colonies, that's a different repo entirely — ignore it for this project.
