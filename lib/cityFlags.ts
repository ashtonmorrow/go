// === Wikidata-sourced city flag lookup =====================================
// There is no equivalent of flagcdn.com for cities. Civic flags live on
// Wikipedia / Wikimedia Commons, indexed by Wikidata QID. Each city's
// Wikidata entity has property P41 (flag image) and / or P94 (coat of arms).
//
// This module batch-fetches those properties from Wikidata's wbgetentities
// API (50 IDs per request, ~5MB response cap). Result is a Map<qid, url>
// pointing at the Wikimedia Commons rendering URL for the file.
//
// Strategy
// --------
//   1. Cities have Wikidata IDs in Notion (already populated on the
//      structured-facts enrichment pass).
//   2. We feed all the QIDs into this fetcher in one go (per page render).
//      Behind the scenes it batches into wbgetentities calls of 50.
//   3. Each batch is cached by Next ISR for 24 hours via the `next:
//      { revalidate }` fetch option so subsequent renders skip the round
//      trip entirely. React `cache()` adds intra-render dedupe.
//   4. The page calls `flagFor(qid)` on the returned map for each city
//      to fill in cityFlag when Notion has nothing.
//
// Coverage estimate based on similar SPARQL runs on European + East Asian
// cities: ~60–75% of major cities have a flag, ~85% have either flag or
// coat of arms. Sister-city placeholders (small towns) tend to be sparser.
//
// Licence
// -------
//   • Wikidata data: CC0 (public domain dedication)
//   • Commons images: each file's own licence (most flag SVGs are PD or
//     CC-BY-SA; flag designs themselves are public-domain national symbols)
//
// References
//   - https://www.wikidata.org/wiki/Property:P41   (flag image)
//   - https://www.wikidata.org/wiki/Property:P94   (coat of arms image)
//   - https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities
//
import { cache } from 'react';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_FILEPATH = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const BATCH_SIZE = 50;

// Wikidata's claim shape (just the bits we need). The API returns nested
// arrays of "claims" keyed by property; each claim's mainsnak holds the
// actual value (the Commons filename string for image-type properties).
type WikidataClaim = {
  mainsnak?: { datavalue?: { value?: unknown } };
};
type WikidataEntity = {
  claims?: Record<string, WikidataClaim[]>;
};
type WbGetEntitiesResponse = {
  entities?: Record<string, WikidataEntity>;
};

/**
 * Bulk-fetch flag URLs for a list of Wikidata QIDs. Returns a Map keyed by
 * QID; entries are omitted for entities with no P41 / P94. Safe to call
 * with an empty array (returns an empty Map).
 */
export const fetchCityFlags = cache(async (qids: (string | null | undefined)[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  // Filter to valid QIDs and dedupe.
  const ids = Array.from(
    new Set(qids.filter((q): q is string => !!q && /^Q\d+$/.test(q)))
  );
  if (ids.length === 0) return result;

  // Batch into groups of 50 — wbgetentities's per-request maximum.
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const url =
      `${WIKIDATA_API}?action=wbgetentities&format=json&props=claims&ids=${batch.join('|')}&origin=*`;

    try {
      const res = await fetch(url, {
        next: { revalidate: 86400 }, // 24 h cache via Next ISR
        headers: {
          // Wikidata recommends a descriptive User-Agent identifying the
          // application + contact for traceability.
          'User-Agent': 'go.mike-lee.me (https://go.mike-lee.me) personal travel atlas',
        },
      });
      if (!res.ok) continue;
      const data: WbGetEntitiesResponse = await res.json();
      const entities = data.entities ?? {};

      for (const [qid, entity] of Object.entries(entities)) {
        const claims = entity.claims ?? {};
        // P41 = flag image; P94 = coat of arms. Many smaller cities have
        // only the latter. Either is a fine "civic emblem" stamp.
        const filename =
          (claims.P41?.[0]?.mainsnak?.datavalue?.value as string | undefined) ||
          (claims.P94?.[0]?.mainsnak?.datavalue?.value as string | undefined);
        if (filename && typeof filename === 'string') {
          // Commons filenames use spaces in their canonical form, but the
          // FilePath endpoint also accepts underscored variants. Either way,
          // URL-encoding the result is safe.
          const safe = encodeURIComponent(filename.replace(/ /g, '_'));
          // ?width=640 picks the rendering thumbnail size — same dimension
          // we use for country flags from flagcdn for visual parity.
          result.set(qid, `${COMMONS_FILEPATH}/${safe}?width=640`);
        }
      }
    } catch {
      // Swallow batch errors and continue. A failed batch just means those
      // cities fall through to the country-flag fallback downstream.
      continue;
    }
  }

  return result;
});
