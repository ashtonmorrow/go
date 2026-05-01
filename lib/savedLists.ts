// === Saved-list slug helpers =================================================
// Saved-list names in the DB are already lowercased + emoji-stripped at import
// time (see scripts/import-google-takeout.ts → slugify_list_name). So a name
// like "Bangkok 🇹🇭" is stored as "bangkok"; "Coffee Shops" stored as
// "coffee shops". For URL slugs we only need to swap spaces for dashes and
// percent-encode anything weird. The reverse mapping is the simple inverse.
//
// We don't try to disambiguate collision cases (two lists that slugify to the
// same value); the import script's normalize already collapses duplicates.

/** Convert a saved-list name to a URL slug. */
export function listNameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Convert a URL slug back to a saved-list name (best-effort reverse). */
export function slugToListName(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, ' ').toLowerCase();
}
