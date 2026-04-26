// === /llms.txt =============================================================
// Curated manifest for LLM crawlers — see https://llmstxt.org/
//
// llms.txt is to LLMs what sitemap.xml is to search engines, but smaller
// and human-curated. It points at the highest-signal entry points and
// gives a one-line description of each. Crawlers that respect the
// convention will land on these instead of guessing from the index.
//
// We serve it via a Next.js Route Handler so the URL list stays fresh
// without manual edits — same data flow as the sitemap.
//
import { fetchAllCountries, fetchAllCities } from '@/lib/notion';
import { fetchAllPins } from '@/lib/pins';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  AUTHOR_NAME,
} from '@/lib/seo';

export const revalidate = 3600;

function header(): string {
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `Authored by ${AUTHOR_NAME}. Source data lives in Notion (cities, countries),`,
    `Supabase Postgres (pins), and a few open-data APIs (Wikidata for flags,`,
    `NASA POWER for climate, fawazahmed0/currency-api for live FX rates,`,
    `whc.unesco.org for World Heritage IDs). All facts are pulled at build`,
    `time and revalidated hourly.`,
    '',
  ].join('\n');
}

function section(title: string, items: { url: string; name: string; description?: string }[]) {
  if (items.length === 0) return '';
  const lines = [`## ${title}`, ''];
  for (const it of items) {
    const desc = it.description ? `: ${it.description}` : '';
    lines.push(`- [${it.name}](${it.url})${desc}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function GET(): Promise<Response> {
  const [countries, cities, pins] = await Promise.all([
    fetchAllCountries(),
    fetchAllCities(),
    fetchAllPins(),
  ]);

  // Object × View nav — same matrix lives in the sitebar (object) +
  // per-page ViewSwitcher (view).
  const navigation = section('Views', [
    { url: `${SITE_URL}/cities/cards`,    name: 'Cities — Postcards', description: '1,341 cities as hand-rotated postcards' },
    { url: `${SITE_URL}/cities/map`,      name: 'Cities — Map',       description: 'Interactive globe of every city, sister-city graph on click' },
    { url: `${SITE_URL}/cities/table`,    name: 'Cities — Table',     description: 'Sortable data table of all 1,341 cities' },
    { url: `${SITE_URL}/countries/cards`, name: 'Countries — Cards',  description: '213 countries as flag tiles with travel logistics' },
    { url: `${SITE_URL}/countries/map`,   name: 'Countries — Globe',  description: 'Country-shaded globe driven by the same filter cockpit' },
    { url: `${SITE_URL}/countries/table`, name: 'Countries — Table',  description: 'Sortable data table of all 213 countries' },
    { url: `${SITE_URL}/pins/cards`,      name: 'Pins — Cards',       description: 'Curated places of interest (UNESCO sites, museums, viewpoints)' },
    { url: `${SITE_URL}/pins/map`,        name: 'Pins — Map',         description: 'Globe of every pin with click-through detail' },
    { url: `${SITE_URL}/pins/table`,      name: 'Pins — Table',       description: 'Sortable data table of every pin' },
    { url: `${SITE_URL}/about`,           name: 'About',              description: 'How the atlas is built — sources, stack, and design choices' },
  ]);

  // Curated highlights only — Been + Want-to-go cities — to keep the
  // manifest signal-rich rather than dumping the whole 1,300+ row set.
  const curatedCities = cities
    .filter(c => c.been || c.go)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60)
    .map(c => ({
      url: `${SITE_URL}/cities/${c.slug}`,
      name: c.name + (c.country ? `, ${c.country}` : ''),
    }));
  const cityHighlights = section('Curated cities (Been + Want to go)', curatedCities);

  // Visited pins are the authentic-recommendation subset.
  const visitedPins = pins
    .filter(p => p.visited)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60)
    .map(p => ({
      url: `${SITE_URL}/pins/${p.slug ?? p.id}`,
      name: p.name + (p.statesNames[0] ? `, ${p.statesNames[0]}` : ''),
    }));
  const pinHighlights = section('Pins I have visited', visitedPins);

  // Country index — listing all 213 is fine; they're terse.
  const countryItems = countries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => ({ url: `${SITE_URL}/countries/${c.slug}`, name: c.name }));
  const countryList = section('Countries', countryItems.slice(0, 40));

  const machineRefs = [
    `## Machine-readable indexes`,
    '',
    `- [Sitemap](${SITE_URL}/sitemap.xml): every public URL`,
    `- [Robots](${SITE_URL}/robots.txt): crawl rules`,
    '',
  ].join('\n');

  const body = [
    header(),
    navigation,
    cityHighlights,
    pinHighlights,
    countryList,
    machineRefs,
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
