import { Client, APIResponseError } from '@notionhq/client';
import { cache } from 'react';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Retry wrapper with exponential backoff for Notion's rate_limited (429) errors.
// Notion returns a Retry-After header; we honor it when present.
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e instanceof APIResponseError && e.code === 'rate_limited') {
        // Retry-After may be exposed on the error headers; default to exp backoff
        const hdr = (e as any).headers?.get?.('retry-after');
        const retryAfterMs = hdr ? parseFloat(hdr) * 1000 : Math.min(1000 * 2 ** i, 10000);
        await new Promise(r => setTimeout(r, retryAfterMs));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Notion database IDs. The Notion SDK's `databases.query` uses these directly for single-source databases.
export const CITIES_DB = '2d3fdea3fd4b8080b8e4fc674cdf8cd4';
export const COUNTRIES_DB = 'a925032ca4da48fa952e9dde3713955f';

export type City = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  countryPageId: string | null;
  localName: string | null;
  been: boolean;
  go: boolean;
  lat: number | null;
  lng: number | null;
  population: number | null;
  area: number | null;
  elevation: number | null;
  mayor: string | null;
  founded: string | null;
  demonym: string | null;
  timeZone: string | null;
  utcOffset: string | null;
  avgHigh: number | null;
  avgLow: number | null;
  rainfall: number | null;
  koppen: string | null;
  nicknames: string | null;
  motto: string | null;
  iataAirports: string | null;
  sisterCities: string[]; // page IDs
  heroImage: string | null;
  personalPhoto: string | null;
  wikipediaUrl: string | null;
  wikipediaSummary: string | null;
  quote: string | null;
  about: string | null;
  whyVisit: string | null;
  avoid: string | null;
  plac: string | null;
  hotSeasonName: string | null;
  hotSeasonDescription: string | null;
  coldSeasonName: string | null;
  coolerWetterSeason: string | null;
  myGooglePlaces: string | null;
  savedPlaces: string | null;
};

export type Country = {
  id: string;
  name: string;
  slug: string;
  iso2: string | null;
  iso3: string | null;
  continent: string | null;
  capital: string | null;
  language: string | null;
  currency: string | null;
  callingCode: string | null;
  schengen: boolean;
  plugTypes: string[];
  voltage: string | null;
  tapWater: string | null;
  tipping: string | null;
  emergencyNumber: string | null;
  visaUs: string | null;
  wikidataId: string | null;
  wikipediaSummary: string | null;
  flag: string | null;
};

// ---- Property helpers ----
function text(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === 'title') return prop.title.map((t: any) => t.plain_text).join('').trim() || null;
  if (prop.type === 'rich_text') return prop.rich_text.map((t: any) => t.plain_text).join('').trim() || null;
  if (prop.type === 'select') return prop.select?.name || null;
  if (prop.type === 'url') return prop.url || null;
  return null;
}

function number(prop: any): number | null {
  return prop?.type === 'number' ? prop.number : null;
}

function checkbox(prop: any): boolean {
  return prop?.type === 'checkbox' ? !!prop.checkbox : false;
}

function file(prop: any): string | null {
  if (prop?.type !== 'files' || !prop.files?.length) return null;
  const f = prop.files[0];
  if (f.type === 'external') return f.external.url;
  if (f.type === 'file') return f.file.url;
  return null;
}

function multiSelect(prop: any): string[] {
  return prop?.type === 'multi_select' ? prop.multi_select.map((s: any) => s.name) : [];
}

function relation(prop: any): string[] {
  return prop?.type === 'relation' ? prop.relation.map((r: any) => r.id) : [];
}

function parseLatLng(s: string | null): { lat: number | null; lng: number | null } {
  if (!s) return { lat: null, lng: null };
  const m = s.match(/(-?\d+\.?\d*)/g);
  if (!m || m.length < 2) return { lat: null, lng: null };
  const lat = parseFloat(m[0]);
  const lng = parseFloat(m[1]);
  if (isNaN(lat) || isNaN(lng)) return { lat: null, lng: null };
  // Handle direction markers
  const upper = s.toUpperCase();
  const signedLat = upper.match(/[NS]/)?.[0] === 'S' ? -Math.abs(lat) : lat;
  const signedLng = upper.match(/[EW]/)?.[0] === 'W' ? -Math.abs(lng) : lng;
  return { lat: signedLat, lng: signedLng };
}

function rowToCity(row: any): City {
  const p = row.properties;
  const { lat, lng } = parseLatLng(text(p['Lat & Long']));
  return {
    id: row.id,
    name: text(p['Name']) || '',
    slug: text(p['Slug']) || '',
    country: text(p['Country']),
    countryPageId: relation(p['Country (linked)'])[0] || null,
    localName: text(p['Local Name']),
    been: checkbox(p['Been?']),
    go: checkbox(p['Go?']),
    lat, lng,
    population: number(p['Population']),
    area: number(p['Area (km²)']),
    elevation: number(p['Elevation (m)']),
    mayor: text(p['Mayor']),
    founded: text(p['Founded']),
    demonym: text(p['Demonym']),
    timeZone: text(p['Time Zone']),
    utcOffset: text(p['UTC Offset']),
    avgHigh: number(p['Avg High (°C)']),
    avgLow: number(p['Avg Low (°C)']),
    rainfall: number(p['Annual Rainfall (mm)']),
    koppen: text(p['Köppen Climate']),
    nicknames: text(p['Nicknames']),
    motto: text(p['City Motto']),
    iataAirports: text(p['IATA Airports']),
    sisterCities: relation(p['Sister Cities']),
    heroImage: file(p['Hero Image']),
    personalPhoto: file(p['Personal Photo']),
    wikipediaUrl: text(p['Wikipedia URL']),
    wikipediaSummary: text(p['Wikipedia Summary']),
    quote: text(p['Quote']),
    about: text(p['about']),
    whyVisit: text(p['Why Visit?']),
    avoid: text(p['avoid']),
    plac: text(p['Plac']),
    hotSeasonName: text(p['hot/dry season name']),
    hotSeasonDescription: text(p['hot/dry season description']),
    coldSeasonName: text(p['cold/wet season name']),
    coolerWetterSeason: text(p['Cooler/Wetter Season']),
    myGooglePlaces: text(p['My Saved Places']),
    savedPlaces: text(p['My Saved Places']),
  };
}

function rowToCountry(row: any): Country {
  const p = row.properties;
  return {
    id: row.id,
    name: text(p['Name']) || '',
    slug: text(p['Slug']) || '',
    iso2: text(p['ISO2']),
    iso3: text(p['ISO3']),
    continent: text(p['Continent']),
    capital: text(p['Capital']),
    language: text(p['Language']),
    currency: text(p['Currency']),
    callingCode: text(p['Calling Code']),
    schengen: checkbox(p['Schengen?']),
    plugTypes: multiSelect(p['Plug Types']),
    voltage: text(p['Voltage']),
    tapWater: text(p['Tap Water']),
    tipping: text(p['Tipping']),
    emergencyNumber: text(p['Emergency Number']),
    visaUs: text(p['Visa (US Passport)']),
    wikidataId: text(p['Wikidata ID']),
    wikipediaSummary: text(p['Wikipedia Summary']),
    flag: file(p['Flag']),
  };
}

// ---- Fetchers ----
// All fetchers are wrapped with React's `cache()` so that during a single server
// render / build, calling them multiple times only hits Notion once. This
// collapses thousands of redundant pagination passes into a handful.

export const fetchAllCities = cache(async (): Promise<City[]> => {
  if (!process.env.NOTION_TOKEN) {
    console.warn('NOTION_TOKEN not set — returning empty city list');
    return [];
  }
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await withRetry(() =>
      notion.databases.query({
        database_id: CITIES_DB,
        start_cursor: cursor,
        page_size: 100,
      })
    );
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows.map(rowToCity);
});

export const fetchAllCountries = cache(async (): Promise<Country[]> => {
  if (!process.env.NOTION_TOKEN) return [];
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await withRetry(() =>
      notion.databases.query({
        database_id: COUNTRIES_DB,
        start_cursor: cursor,
        page_size: 100,
      })
    );
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows.map(rowToCountry);
});

// Lookup-by-slug reuses the cached list instead of a separate Notion query.
// At ~1,400 rows the in-memory find is O(n) but instant (<1ms).
export const fetchCityBySlug = cache(async (slug: string): Promise<City | null> => {
  const all = await fetchAllCities();
  return all.find(c => c.slug === slug) || null;
});

export const fetchCountryBySlug = cache(async (slug: string): Promise<Country | null> => {
  const all = await fetchAllCountries();
  return all.find(c => c.slug === slug) || null;
});

// Blocks vary per page so caching is per-pageId. Wrapping with `cache()` still
// dedupes multiple calls for the same pageId within a render.
export const fetchPageBlocks = cache(async (pageId: string): Promise<any[]> => {
  if (!process.env.NOTION_TOKEN) return [];
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await withRetry(() =>
      notion.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      })
    );
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
});
