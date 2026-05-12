// === Sovereignty helpers ===================================================
//
// The atlas's `go_countries` table treats every entity that has its own
// page in the atlas as a "country": United Kingdom, but also England,
// Scotland, Wales, and Northern Ireland as separate rows; Vatican City;
// Isle of Man; and so on. That's the right model for the per-country
// detail pages (visitors who want to read about England as its own thing
// can find it at /countries/england) but the wrong model for global
// counters on the home page, where "78 countries visited" reads inflated
// because a single United Kingdom trip with pins in all four constituent
// nations contributes 5 entries instead of 1.
//
// This file owns the small lookup that collapses sub-national entries
// into their sovereign parent. The home page uses it to derive a count
// that matches a visitor's intuition of "countries"; the per-country
// detail pages don't use it.
//
// Adding more mappings: keep the keys lowercased to match the
// case-insensitive lookup pattern the home page uses. Values are the
// canonical sovereign country name as it appears (case-insensitively)
// in the go_countries.name column.

/** Map of sub-national / dependent-territory country names → sovereign parent.
 *  Keys MUST be lowercased; values match go_countries.name case-insensitively.
 *  Anything not in this map is treated as its own sovereign entity. */
const SOVEREIGN_PARENT: Record<string, string> = {
  // United Kingdom constituent nations
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  'northern ireland': 'united kingdom',
  // The Vatican is a sovereign state but the atlas spells it "The
  // Vatican"; this entry is here only to normalise alternate spellings
  // a future Mike-tagged pin might use.
  'vatican city': 'the vatican',
};

/** Return the sovereign-country name for a given country-name string.
 *  Falls through to the input lowercased if no parent mapping exists.
 *  Useful for global stat counters where sub-nationals should collapse
 *  into their parent. */
export function sovereignParent(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return SOVEREIGN_PARENT[key] ?? key;
}

/** Predicate: is this country name a sub-national entity that collapses
 *  into a different sovereign parent? Used to filter the denominator of
 *  "X of Y" stats so the total isn't inflated by sub-national rows that
 *  the numerator now collapses. */
export function isSubNational(name: string | null | undefined): boolean {
  if (!name) return false;
  const key = name.trim().toLowerCase();
  return key in SOVEREIGN_PARENT;
}
