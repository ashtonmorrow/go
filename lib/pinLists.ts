// === Pin lists — canonical set + alias map =================================
// pins.lists holds notable-list memberships (UNESCO World Heritage, Atlas
// Obscura, etc.). Strategy: keep the set SMALL and TRAVELER-MEANINGFUL.
// Anything you can't explain to someone planning a trip in one breath
// doesn't belong here.
//
// Why this file exists
//
// The first Wikidata enrichment pass appended every P1435 (heritage
// designation) value it found, which gave us 30+ labels including
// country-level registries ('bien de interés cultural', 'Iranian
// National Heritage', 'Major Historical and Cultural Site Protected at
// the National Level', etc.) plus duplicate UNESCO labels under
// different Wikidata wordings ('World Heritage Site', 'part of UNESCO
// World Heritage Site'). Migration `pins_canonical_lists_cleanup`
// collapsed those into the canonical set below; any future enrichment
// pass should normalise via LIST_ALIASES before writing to lists,
// rather than repolluting.

export const CANONICAL_LISTS = [
  'UNESCO World Heritage',
  'UNESCO Tentative List',
  'Atlas Obscura',
  'Ramsar Wetland',
  'International Dark Sky Park',
  'IUGS Geological Heritage Site',
  'New 7 Wonders',
  '7 Natural Wonders',
  '7 Ancient Wonders',
] as const;

export type CanonicalList = typeof CANONICAL_LISTS[number];

/**
 * Map noisy-source labels to canonical labels. Covers the variants
 * Wikidata's P1435 produces for the same designation. Anything not in
 * this map should be DROPPED, not passed through — country-level
 * registries don't belong on a traveler atlas.
 */
export const LIST_ALIASES: Record<string, CanonicalList> = {
  // UNESCO World Heritage — three Wikidata labels for the same thing
  'UNESCO World Heritage':              'UNESCO World Heritage',
  'World Heritage Site':                'UNESCO World Heritage',
  'part of UNESCO World Heritage Site': 'UNESCO World Heritage',
  // Tentative list — places nominated, not yet inscribed
  'Tentative World Heritage Site':      'UNESCO Tentative List',
  // Cult-classic offbeat-places list (cross-referenced via Wikidata P3134)
  'Atlas Obscura':                      'Atlas Obscura',
  // Wetlands of international importance (RAMSAR convention)
  'Ramsar site':                        'Ramsar Wetland',
  // Stargazer / night-sky preservation
  'International Dark Sky Park':        'International Dark Sky Park',
  // Geological heritage
  'IUGS Geological Heritage Site':      'IUGS Geological Heritage Site',
  // Wonder sets — seeded by hand in pins_enrichment_columns migration
  'New 7 Wonders':                      'New 7 Wonders',
  '7 Natural Wonders':                  '7 Natural Wonders',
  '7 Ancient Wonders':                  '7 Ancient Wonders',
};

/**
 * Normalise an arbitrary list of incoming labels to the canonical set.
 * Drops anything not in LIST_ALIASES. Order-insensitive; deduped.
 *
 * Usage: any pin enrichment script should run incoming labels through
 * this before writing to pins.lists, e.g.
 *
 *     await execute_sql(`UPDATE pins SET lists = $1 WHERE id = $2`, [
 *       normaliseLists([...wikidataDesignations, 'UNESCO World Heritage']),
 *       pinId,
 *     ]);
 */
export function normaliseLists(raw: string[]): CanonicalList[] {
  const out = new Set<CanonicalList>();
  for (const label of raw) {
    const canonical = LIST_ALIASES[label];
    if (canonical) out.add(canonical);
  }
  return Array.from(out).sort();
}

// === List visual identity =================================================
// Each canonical list gets a single emoji glyph and a short label suitable
// for a compact badge. The emoji carries 80% of the recognition load — a
// globe for UNESCO, a compass for Atlas Obscura's offbeat-explorer vibe,
// a droplet for Ramsar wetlands, etc. — so the chit can stay tiny without
// losing meaning. Short labels are used in the card badge; the full
// canonical name still appears in the badge `title` for accessibility.

export const LIST_ICONS: Record<CanonicalList, string> = {
  'UNESCO World Heritage':           '🌐',
  'UNESCO Tentative List':           '🌐',
  'Atlas Obscura':                   '🧭',
  'Ramsar Wetland':                  '💧',
  'International Dark Sky Park':     '✨',
  'IUGS Geological Heritage Site':   '⛰️',
  'New 7 Wonders':                   '⭐',
  '7 Natural Wonders':               '🌿',
  '7 Ancient Wonders':               '🏛️',
};

/**
 * Compact label used inside the card badge — the canonical name is often
 * too long to fit two badges side-by-side ("IUGS Geological Heritage Site"
 * is 30 chars). We keep these short and recognisable; the full name is
 * still surfaced via `title` and on the detail page.
 */
export const LIST_SHORT_LABELS: Record<CanonicalList, string> = {
  'UNESCO World Heritage':           'UNESCO',
  'UNESCO Tentative List':           'UNESCO Tentative',
  'Atlas Obscura':                   'Atlas Obscura',
  'Ramsar Wetland':                  'Ramsar',
  'International Dark Sky Park':     'Dark Sky',
  'IUGS Geological Heritage Site':   'IUGS Geo',
  'New 7 Wonders':                   'New 7 Wonders',
  '7 Natural Wonders':               '7 Natural',
  '7 Ancient Wonders':               '7 Ancient',
};
