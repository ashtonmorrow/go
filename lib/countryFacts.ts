// === Country facts =========================================================
// Read-only data layer for the public.country_facts Supabase table —
// numeric baselines (population, area, GDP, HDI, life expectancy)
// pulled from Wikidata. Joined with the Notion-sourced country
// records by ISO2.
//
// Cached via React.cache() so a single render that reads facts
// multiple ways (stats page + detail page sidebar) only hits Supabase
// once.
//
import { cache } from 'react';
import { supabase } from './supabase';

export type CountryFact = {
  iso2: string;
  iso3: string | null;
  population: number | null;
  areaKm2: number | null;
  gdpNominalUsd: number | null;
  gdpPppUsd: number | null;
  /** 0.0 - 1.0 */
  hdi: number | null;
  lifeExpectancy: number | null;
  /** Year of the most recent value used. */
  dataYear: number | null;
  source: string;
  updatedAt: string | null;
};

function rowToFact(row: any): CountryFact {
  return {
    iso2: String(row.iso2 ?? '').toUpperCase(),
    iso3: row.iso3 ?? null,
    population:      typeof row.population        === 'number' ? row.population        : null,
    areaKm2:         typeof row.area_km2          === 'number' ? row.area_km2          : null,
    gdpNominalUsd:   typeof row.gdp_nominal_usd   === 'number' ? row.gdp_nominal_usd   : null,
    gdpPppUsd:       typeof row.gdp_ppp_usd       === 'number' ? row.gdp_ppp_usd       : null,
    hdi:             typeof row.hdi               === 'number' ? row.hdi               : null,
    lifeExpectancy:  typeof row.life_expectancy   === 'number' ? row.life_expectancy   : null,
    dataYear:        typeof row.data_year         === 'number' ? row.data_year         : null,
    source:          row.source ?? 'wikidata',
    updatedAt:       row.updated_at ?? null,
  };
}

/**
 * Every country fact row, keyed by ISO2. Pages then merge by ISO2
 * with the Notion country records.
 */
export const fetchAllCountryFacts = cache(async (): Promise<Map<string, CountryFact>> => {
  const { data, error } = await supabase
    .from('country_facts')
    .select('*');
  if (error) {
    console.error('[countryFacts] fetch failed:', error);
    return new Map();
  }
  const out = new Map<string, CountryFact>();
  for (const row of data ?? []) {
    const fact = rowToFact(row);
    if (fact.iso2) out.set(fact.iso2, fact);
  }
  return out;
});

// ---- Display helpers ------------------------------------------------------

/**
 * Compact human-readable string for big numeric counts. 12,345,678 → "12.3M".
 */
export function compactNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T';
  if (abs >= 1_000_000_000)     return (n / 1_000_000_000).toFixed(1) + 'B';
  if (abs >= 1_000_000)         return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000)             return (n / 1_000).toFixed(1) + 'k';
  return Intl.NumberFormat('en').format(n);
}

/** USD-prefixed compact number, e.g. "$3.4T". null returns "—". */
export function compactUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  return '$' + compactNumber(n);
}

/**
 * GDP per capita in USD, derived from country facts. null when either
 * GDP or population is missing.
 */
export function gdpPerCapita(fact: CountryFact | undefined | null): number | null {
  if (!fact) return null;
  const gdp = fact.gdpNominalUsd;
  const pop = fact.population;
  if (gdp == null || pop == null || pop <= 0) return null;
  return gdp / pop;
}
