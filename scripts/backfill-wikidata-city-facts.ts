/**
 * Fill blank go_cities factual fields from Wikidata.
 *
 * This deliberately avoids overwriting existing Supabase values. It is meant
 * for high-volume enrichment after the Notion -> Supabase migration.
 *
 * Source: https://www.wikidata.org/
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.STRAY_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[wd] Missing env. Need NEXT_PUBLIC_SUPABASE_URL + STRAY_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : null;
const CONTINENT_ARG = process.argv.find(arg => arg.startsWith('--continent='));
const CONTINENT_FILTER = CONTINENT_ARG ? CONTINENT_ARG.split('=').slice(1).join('=').trim() : null;
const BATCH_SIZE = Number(process.env.WIKIDATA_BATCH_SIZE ?? 80);
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';

const CONTINENT_ORDER = [
  'South America',
  'North America',
  'Oceania',
  'Australia',
  'Europe',
  'Asia',
  'Africa',
  'Antarctica',
  'Unknown',
];

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type CityRow = {
  id: string;
  name: string;
  slug: string | null;
  country: string | null;
  country_id: string | null;
  been: boolean | null;
  go: boolean | null;
  wikidata_id: string | null;
  mayor: string | null;
  founded: string | null;
  demonym: string | null;
  nicknames: string | null;
  motto: string | null;
  iata_airports: string | null;
  sister_cities: string[] | null;
};

type CountryRow = {
  id: string;
  name: string;
  continent: string | null;
};

type Facts = {
  mayor?: string;
  founded?: string;
  demonyms: string[];
  nicknames: string[];
  mottos: string[];
  sisterQids: string[];
  iataCodes: string[];
};

type SparqlBinding = Record<string, { type: string; value: string; 'xml:lang'?: string }>;

function empty(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalQid(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/Q\d+/i);
  return m ? m[0].toUpperCase() : null;
}

function qidFromUri(uri: string): string | null {
  const m = uri.match(/\/entity\/(Q\d+)$/i);
  return m ? m[1].toUpperCase() : null;
}

function uniq(values: Iterable<string>): string[] {
  return [...new Set([...values].map(v => v.trim()).filter(Boolean))];
}

function compactList(values: string[], max = 5): string | null {
  const out = uniq(values).slice(0, max);
  return out.length ? out.join(', ') : null;
}

function formatWikidataDate(value: string): string | null {
  const m = value.match(/^(-?\d{1,6})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const rawYear = Number(m[1]);
  if (!Number.isFinite(rawYear)) return null;
  const year = rawYear <= 0 ? `${1 - rawYear} BC` : String(rawYear);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month === 1 && day === 1) return year;
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1))
  );
  return `${monthName} ${day}, ${year}`;
}

function continentRank(continent: string): number {
  const i = CONTINENT_ORDER.indexOf(continent);
  return i === -1 ? CONTINENT_ORDER.length : i;
}

async function fetchAll<T>(table: string, select = '*'): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < page) break;
  }
  return out;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sparql(query: string): Promise<SparqlBinding[]> {
  const body = new URLSearchParams({ query, format: 'json' });
  const res = await fetch(WIKIDATA_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'go.mike-lee.me/1.0 (mikeyle3@gmail.com) Wikidata enrichment',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wikidata HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  return json?.results?.bindings ?? [];
}

function valuesBlock(qids: string[]): string {
  return qids.map(qid => `wd:${qid}`).join(' ');
}

function getFact(map: Map<string, Facts>, qid: string): Facts {
  let fact = map.get(qid);
  if (!fact) {
    fact = { demonyms: [], nicknames: [], mottos: [], sisterQids: [], iataCodes: [] };
    map.set(qid, fact);
  }
  return fact;
}

async function fetchFacts(qids: string[]): Promise<Map<string, Facts>> {
  const facts = new Map<string, Facts>();
  if (qids.length === 0) return facts;
  const values = valuesBlock(qids);

  const basic = await sparql(`
    SELECT ?city ?mayorLabel ?inception WHERE {
      VALUES ?city { ${values} }
      OPTIONAL { ?city wdt:P6 ?mayor. }
      OPTIONAL { ?city wdt:P571 ?inception. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?mayor rdfs:label ?mayorLabel. }
    }
  `);
  for (const row of basic) {
    const qid = qidFromUri(row.city?.value);
    if (!qid) continue;
    const fact = getFact(facts, qid);
    if (!fact.mayor && row.mayorLabel?.value) fact.mayor = row.mayorLabel.value;
    if (!fact.founded && row.inception?.value) fact.founded = formatWikidataDate(row.inception.value) ?? undefined;
  }
  await sleep(250);

  const literalProps: [keyof Pick<Facts, 'demonyms' | 'nicknames' | 'mottos'>, string][] = [
    ['demonyms', 'P1549'],
    ['nicknames', 'P1449'],
    ['mottos', 'P1451'],
  ];
  for (const [field, prop] of literalProps) {
    const rows = await sparql(`
      SELECT ?city ?value WHERE {
        VALUES ?city { ${values} }
        ?city wdt:${prop} ?value.
        FILTER(LANG(?value) = "" || LANG(?value) = "en")
      }
    `);
    for (const row of rows) {
      const qid = qidFromUri(row.city?.value);
      const value = row.value?.value;
      if (!qid || !value) continue;
      getFact(facts, qid)[field].push(value);
    }
    await sleep(250);
  }

  const sisters = await sparql(`
    SELECT ?city ?sister WHERE {
      VALUES ?city { ${values} }
      ?city wdt:P190 ?sister.
    }
  `);
  for (const row of sisters) {
    const qid = qidFromUri(row.city?.value);
    const sisterQid = qidFromUri(row.sister?.value);
    if (!qid || !sisterQid) continue;
    getFact(facts, qid).sisterQids.push(sisterQid);
  }
  await sleep(250);

  const airports = await sparql(`
    SELECT ?city ?iata WHERE {
      VALUES ?city { ${values} }
      {
        ?airport wdt:P931 ?city;
                 wdt:P238 ?iata.
      }
      UNION
      {
        ?city wdt:P238 ?iata.
      }
    }
  `);
  for (const row of airports) {
    const qid = qidFromUri(row.city?.value);
    const iata = row.iata?.value;
    if (!qid || !iata) continue;
    getFact(facts, qid).iataCodes.push(iata.toUpperCase());
  }

  return facts;
}

function needsFacts(city: CityRow): boolean {
  return [
    city.mayor,
    city.founded,
    city.demonym,
    city.nicknames,
    city.motto,
    city.iata_airports,
    city.sister_cities,
  ].some(empty);
}

async function main() {
  console.log(`[wd] Loading cities and countries${DRY_RUN ? ' (dry run)' : ''}...`);
  const [cities, countries] = await Promise.all([
    fetchAll<CityRow>('go_cities', 'id, name, slug, country, country_id, been, go, wikidata_id, mayor, founded, demonym, nicknames, motto, iata_airports, sister_cities'),
    fetchAll<CountryRow>('go_countries', 'id, name, continent'),
  ]);
  const countryById = new Map(countries.map(country => [country.id, country]));
  const qidToCityId = new Map<string, string>();
  for (const city of cities) {
    const qid = normalQid(city.wikidata_id);
    if (qid && !String(city.slug ?? '').startsWith('delete-')) qidToCityId.set(qid, city.id);
  }

  let targets = cities
    .filter(city => !String(city.slug ?? '').startsWith('delete-'))
    .filter(city => normalQid(city.wikidata_id))
    .filter(needsFacts)
    .filter(city => {
      if (!CONTINENT_FILTER) return true;
      const continent = countryById.get(city.country_id ?? '')?.continent ?? 'Unknown';
      return continent === CONTINENT_FILTER;
    })
    .sort((a, b) => {
      const ac = countryById.get(a.country_id ?? '')?.continent ?? 'Unknown';
      const bc = countryById.get(b.country_id ?? '')?.continent ?? 'Unknown';
      const byContinent = continentRank(ac) - continentRank(bc);
      if (byContinent) return byContinent;
      const aCurated = Number(Boolean(a.been || a.go));
      const bCurated = Number(Boolean(b.been || b.go));
      if (aCurated !== bCurated) return bCurated - aCurated;
      return a.name.localeCompare(b.name);
    });
  if (LIMIT && Number.isFinite(LIMIT) && LIMIT > 0) targets = targets.slice(0, LIMIT);

  console.log(
    `[wd] ${targets.length} cities have at least one blank Wikidata-backed fact field` +
      `${CONTINENT_FILTER ? ` in ${CONTINENT_FILTER}` : ''}.`
  );

  let updated = 0;
  let filledFields = 0;
  const byContinent = new Map<string, number>();

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const qids = uniq(batch.map(city => normalQid(city.wikidata_id)!).filter(Boolean));
    console.log(`[wd] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(targets.length / BATCH_SIZE)}: ${qids.length} QIDs`);
    let facts: Map<string, Facts>;
    try {
      facts = await fetchFacts(qids);
    } catch (error) {
      console.error('[wd] Batch failed:', error);
      continue;
    }

    for (const city of batch) {
      const qid = normalQid(city.wikidata_id);
      if (!qid) continue;
      const fact = facts.get(qid);
      if (!fact) continue;

      const update: Record<string, unknown> = {};
      if (empty(city.mayor) && fact.mayor) update.mayor = fact.mayor;
      if (empty(city.founded) && fact.founded) update.founded = fact.founded;
      if (empty(city.demonym)) {
        const value = compactList(fact.demonyms, 4);
        if (value) update.demonym = value;
      }
      if (empty(city.nicknames)) {
        const value = compactList(fact.nicknames, 5);
        if (value) update.nicknames = value;
      }
      if (empty(city.motto)) {
        const value = compactList(fact.mottos, 2);
        if (value) update.motto = value;
      }
      if (empty(city.iata_airports)) {
        const value = compactList(fact.iataCodes.sort(), 6);
        if (value) update.iata_airports = value;
      }
      if (empty(city.sister_cities)) {
        const sisterIds = uniq(fact.sisterQids.map(sisterQid => qidToCityId.get(sisterQid)).filter(Boolean) as string[])
          .filter(id => id !== city.id)
          .slice(0, 24);
        if (sisterIds.length) update.sister_cities = sisterIds;
      }

      const keys = Object.keys(update);
      if (keys.length === 0) continue;
      filledFields += keys.length;
      updated++;

      const continent = countryById.get(city.country_id ?? '')?.continent ?? 'Unknown';
      byContinent.set(continent, (byContinent.get(continent) ?? 0) + 1);

      if (DRY_RUN) {
        console.log(`[wd] would update ${city.name} (${continent}): ${keys.join(', ')}`);
      } else {
        const { error } = await sb
          .from('go_cities')
          .update({ ...update, updated_at: new Date().toISOString() })
          .eq('id', city.id);
        if (error) {
          console.error(`[wd] update failed for ${city.name}:`, error);
          continue;
        }
        console.log(`[wd] updated ${city.name} (${continent}): ${keys.join(', ')}`);
      }
    }
  }

  console.log('[wd] Done.');
  console.log(`[wd]   city rows updated: ${updated}`);
  console.log(`[wd]   fields filled:     ${filledFields}`);
  console.log(`[wd]   by continent:      ${JSON.stringify(Object.fromEntries([...byContinent].sort()), null, 2)}`);
}

main().catch(error => {
  console.error('[wd] FATAL:', error);
  process.exit(1);
});
