/**
 * Shared frontmatter-coercion helpers.
 *
 * gray-matter hands back `data` as `Record<string, unknown>` — every field
 * is untyped and may be missing, the wrong type, or (for dates) a parsed
 * `Date` object. These three coercions are the common ground between the
 * list/place loader (lib/content.ts) and the post loader (lib/posts.ts);
 * both previously carried their own near-identical copies.
 *
 * Pure functions, no `server-only` import, so this module is safe to pull
 * into scripts and client-adjacent code as well as the server loaders.
 */

/** A non-empty string, or null. Empty strings collapse to null so callers
 *  can treat "absent" and "blank" the same way. */
export function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** An array of strings, dropping any non-string entries. Non-arrays → []. */
export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/** An ISO date string (YYYY-MM-DD). gray-matter parses unquoted YAML dates
 *  into `Date` objects, so accept those and slice; pass through non-empty
 *  strings as-authored; everything else → null. */
export function asIsoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}
