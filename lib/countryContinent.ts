// === Country name → continent lookup ======================================
// Built from the same Natural Earth dataset that powers WorldMapPicker.
// Lowercased keys for tolerant matching (pins.statesNames carry country
// names from Airtable that may vary in case).
//
// Plus a small alias table for naming variations Natural Earth doesn't
// match exactly — "United States" vs "United States of America",
// "Russia" vs "Russian Federation", etc. Any pin whose statesNames[0]
// doesn't resolve here is left out of continent filtering (rather than
// guessed at), which is the safer default.

import worldGeo from './worldGeo.json';
import type { Continent } from '@/components/CityFiltersContext';

type Feature = { properties: { name: string; iso3: string; continent: string } };

const NAME_TO_CONTINENT: Record<string, Continent> = {};

for (const f of (worldGeo as { features: Feature[] }).features) {
  const name = f.properties.name?.toLowerCase().trim();
  const continent = f.properties.continent as Continent;
  if (name && continent) {
    NAME_TO_CONTINENT[name] = continent;
  }
}

// Aliases — Airtable / Notion names that don't exactly match Natural Earth's
// `NAME` field. Mostly cases where the official long form is present but
// the short form gets typed in everyday usage. Add new entries here when
// a country shows up missing from continent filters.
const NAME_ALIASES: Record<string, string> = {
  'united states':                'united states of america',
  'usa':                          'united states of america',
  'us':                           'united states of america',
  'russia':                       'russia',
  'russian federation':           'russia',
  'south korea':                  'south korea',
  'republic of korea':            'south korea',
  'north korea':                  'north korea',
  "democratic people's republic of korea": 'north korea',
  'czech republic':               'czechia',
  'czechia':                      'czechia',
  'myanmar (burma)':              'myanmar',
  'burma':                        'myanmar',
  'côte d’ivoire':                'ivory coast',
  "côte d'ivoire":                'ivory coast',
  'cote d ivoire':                'ivory coast',
  'east timor':                   'timor-leste',
  'timor leste':                  'timor-leste',
  'swaziland':                    'eswatini',
  'macedonia':                    'north macedonia',
  'fyrom':                        'north macedonia',
  'cape verde':                   'cabo verde',
  'congo (kinshasa)':             'democratic republic of the congo',
  'democratic republic of congo': 'democratic republic of the congo',
  'dr congo':                     'democratic republic of the congo',
  'drc':                          'democratic republic of the congo',
  'congo (brazzaville)':          'republic of congo',
  'republic of the congo':        'republic of congo',
  'palestine':                    'palestine',
  'palestinian territory':        'palestine',
  'vatican':                      'vatican',
  'vatican city':                 'vatican',
  'holy see':                     'vatican',
  'uk':                           'united kingdom',
  'great britain':                'united kingdom',
  'england':                      'united kingdom',
  'wales':                        'united kingdom',
  'scotland':                     'united kingdom',
};

/**
 * Resolve a country name to a continent. Returns null when unknown
 * (rather than guessing) so the caller can decide whether to skip the
 * record or fall through to a different match.
 */
export function continentOfCountry(name: string | null | undefined): Continent | null {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  const aliased = NAME_ALIASES[key] ?? key;
  return NAME_TO_CONTINENT[aliased] ?? null;
}
